import { courseImportKey, dedupeGrades, gradeImportKey, mergeDuplicateCourses, recognizeGradesBatch, recognizeSchedulesBatch, type BatchImage } from "@/services/ai";
import { useImportTask, type ImportPageRetry, type ImportRowSource, type TaskResult } from "@/store/useImportTask";
import type { Course, GradeDraft, SemesterKind } from "@/types";

type ImageImport = {
  images: BatchImage[];
  apiKey: string;
  isOnline: () => Promise<boolean>;
} & (
  { type: "schedule"; context: Parameters<typeof recognizeSchedulesBatch>[2] } |
  { type: "grades"; semester: SemesterKind; yearId?: string; yearName?: string }
);
type ImageResult = Extract<TaskResult, { type: "schedule" | "grades" }>;

function combineRows<Row>(previous: Row[], next: Row[], previousSources: ImportRowSource[], nextSources: ImportRowSource[], merge: (rows: Row[]) => Row[]) {
  const rows = [...previous];
  const sources = [...previousSources];
  const positions = new Map(sources.map((source, i) => [source.key, i]));
  next.forEach((row, i) => {
    const source = nextSources[i];
    const position = positions.get(source.key);
    if (position === undefined) {
      positions.set(source.key, rows.length);
      rows.push(row);
      sources.push(source);
      return;
    }
    const existing = sources[position];
    if (!existing.edited) rows[position] = merge([rows[position], row])[0];
    sources[position] = { ...existing, pages: [...new Set([...existing.pages, ...source.pages])].sort((a,b) => a - b) };
  });
  return { rows, sources };
}

function mergeResults(previous: ImageResult | undefined, next: ImageResult): ImageResult {
  if (previous?.type === "schedule" && next.type === "schedule") {
    const { rows, sources } = combineRows(previous.schedule.courses, next.schedule.courses, previous.sources!, next.sources!, mergeDuplicateCourses);
    return { ...previous, schedule: { ...previous.schedule, courses: rows }, sources };
  }
  if (previous?.type === "grades" && next.type === "grades") {
    const { rows, sources } = combineRows(previous.grades, next.grades, previous.sources!, next.sources!, dedupeGrades);
    return { ...previous, grades: rows, sources };
  }
  return next;
}

export async function runImageImportTask(request: ImageImport) {
  const { images, ...config } = request;
  type Page = { number: number; image: BatchImage };
  const run = async (pages: Page[], seq: number, previous?: ImageResult): Promise<void> => {
    const current = () => {
      const state = useImportTask.getState();
      return state.seq === seq && state.status === "analyzing" ? state : undefined;
    };
    const failed: Page[] = [];
    let result = previous;
    let errorMessage = "未识别到有效数据，请换一张清晰的图片再试。";
    try {
      const useAI = await config.isOnline() && Boolean(config.apiKey);
      if (!current()) return;
      const opts = {
        useAI,
        onPageFailure: (index: number) => failed.push(pages[index]),
        onProgress: (index: number, total: number) => current()?.setPhase(
          `正在${useAI ? "联网" : "离线"}识别原批次第 ${pages[index - 1].number} 张（${index}/${total}）…`,
          Math.round(18 + ((index - 1) / total) * 62),
        ),
      };
      const selected = pages.map(page => page.image);
      const pageSources = new Map<string, Set<number>>();
      const collect = <Row,>(index: number, rows: readonly Row[], keyOf: (row: Row) => string) => {
        for (const row of rows) {
          const key = keyOf(row);
          if (!pageSources.has(key)) pageSources.set(key, new Set());
          pageSources.get(key)!.add(pages[index].number);
        }
      };
      const sourceFor = (key: string): ImportRowSource => ({ key, pages: [...(pageSources.get(key) ?? [])] });
      if (config.type === "schedule") {
        const { schedule } = await recognizeSchedulesBatch(selected, config.apiKey, config.context, {
          ...opts, onPageRows: (index, rows: readonly Course[]) => collect(index, rows, courseImportKey),
        });
        result = mergeResults(previous, { type: "schedule", schedule, sources: schedule.courses.map(row => sourceFor(courseImportKey(row))) });
      } else {
        const { grades } = await recognizeGradesBatch(selected, config.apiKey, config.semester, {
          ...opts, onPageRows: (index, rows: readonly GradeDraft[]) => collect(index, rows, gradeImportKey),
        });
        result = mergeResults(previous, { type: "grades", grades, yearId: config.yearId, sources: grades.map(row => sourceFor(gradeImportKey(row))) });
      }
    } catch (error) {
      if (!failed.length) failed.push(...pages);
      if (error instanceof Error) errorMessage = error.message;
    }
    const task = current();
    if (!task) return;
    const retry: ImportPageRetry | undefined = failed.length ? {
      pages: failed.map(page => page.number),
      run: async () => {
        const state = useImportTask.getState();
        if (state.retry !== retry || state.seq !== seq || state.status === "analyzing") return;
        const collected = state.result?.type === "schedule" || state.result?.type === "grades" ? state.result : undefined;
        state.open(config.type, `重试 ${failed.length} 张图片`);
        await run(failed, useImportTask.getState().seq, collected);
      },
    } : undefined;
    if (!result) {
      task.fail(errorMessage, retry);
    } else if (result.type === "schedule") {
      task.complete(result, `已识别 ${result.schedule.courses.length} 门课程，请确认后导入。`, retry);
    } else {
      const destination = config.type === "grades" && config.yearName ? `，将导入到「${config.yearName}」` : "";
      task.complete(result, `已识别 ${result.grades.length} 条成绩${destination}，请确认后导入。`, retry);
    }
  };
  await run(images.map((image, index) => ({ number: index + 1, image })), useImportTask.getState().seq);
}

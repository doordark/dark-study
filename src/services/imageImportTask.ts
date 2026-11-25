import {
  courseImportKey,
  dedupeGrades,
  gradeImportKey,
  mergeDuplicateCourses,
  recognizeGradesBatch,
  recognizePeriodsBatch,
  recognizeSchedulesBatch,
  type BatchImage,
} from "@/services/ai";
import { normalizeParsedPeriods } from "@/utils/courseEditing";
import {
  useImportTask,
  type ImportPageRetry,
  type ImportRowSource,
  type TaskResult,
} from "@/store/useImportTask";
import type {
  Course,
  GpaScaleId,
  GradeDraft,
  GradeType,
  SemesterKind,
} from "@/types";

type ImageImport = {
  images: BatchImage[];
  apiKey: string;
  isOnline: () => Promise<boolean>;
} & (
  | { type: "schedule"; context: Parameters<typeof recognizeSchedulesBatch>[2] }
  | {
      type: "grades";
      semester: SemesterKind;
      yearId?: string;
      yearName?: string;
      scale?: GpaScaleId;
      types?: readonly GradeType[];
    }
  | { type: "periods"; scheduleId?: string }
);

type ImageResult = Extract<
  TaskResult,
  { type: "schedule" | "grades" | "periods" }
>;

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "请求已取消")
  );
}

function combineRows<Row>(
  previous: Row[],
  next: Row[],
  previousSources: ImportRowSource[],
  nextSources: ImportRowSource[],
  merge: (rows: Row[]) => Row[],
) {
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
    sources[position] = {
      ...existing,
      pages: [...new Set([...existing.pages, ...source.pages])].sort(
        (a, b) => a - b,
      ),
    };
  });
  return { rows, sources };
}

function mergeResults(
  previous: ImageResult | undefined,
  next: ImageResult,
): ImageResult {
  if (previous?.type === "schedule" && next.type === "schedule") {
    const { rows, sources } = combineRows(
      previous.schedule.courses,
      next.schedule.courses,
      previous.sources!,
      next.sources!,
      mergeDuplicateCourses,
    );
    return {
      ...previous,
      schedule: { ...previous.schedule, courses: rows },
      sources,
    };
  }
  if (previous?.type === "grades" && next.type === "grades") {
    const { rows, sources } = combineRows(
      previous.grades,
      next.grades,
      previous.sources!,
      next.sources!,
      dedupeGrades,
    );
    return { ...previous, grades: rows, sources };
  }
  if (previous?.type === "periods" && next.type === "periods") {
    return {
      ...previous,
      periods: normalizeParsedPeriods([...previous.periods, ...next.periods]),
    };
  }
  return next;
}

export async function runImageImportTask(request: ImageImport) {
  const { images, ...config } = request;
  type Page = { number: number; image: BatchImage };
  const run = async (
    pages: Page[],
    seq: number,
    previous?: ImageResult,
  ): Promise<void> => {
    const current = () => {
      const state = useImportTask.getState();
      return state.seq === seq && state.status === "analyzing"
        ? state
        : undefined;
    };
    const signal = useImportTask.getState().getSignal();
    const failed: Page[] = [];
    let result = previous;
    let usedAI = false;
    let usedOfflineFallback = false;
    let errorMessage = "未识别到有效数据，请换一张清晰的图片再试。";
    try {
      const useAI = (await config.isOnline()) && Boolean(config.apiKey);
      usedAI = useAI;
      if (!current() || signal?.aborted) return;
      const opts = {
        useAI,
        signal,
        onPageFailure: (index: number) => failed.push(pages[index]),
        onFallbackOffline: () => {
          usedOfflineFallback = true;
          current()?.setPhase("云端识别波动，已自动切换本地离线识别…", 60);
        },
        onProgress: (index: number, total: number) => {
          const pageNo = pages[Math.min(index - 1, pages.length - 1)]?.number ?? index;
          current()?.setPhase(
            `正在${useAI ? "联网" : "离线"}识别原批次第 ${pageNo} 张（${index}/${total}）…`,
            Math.round(18 + ((index - 1) / Math.max(1, total)) * 64),
          );
        },
      };
      const selected = pages.map((page) => page.image);
      const pageSources = new Map<string, Set<number>>();
      const collect = <Row,>(
        index: number,
        rows: readonly Row[],
        keyOf: (row: Row) => string,
      ) => {
        for (const row of rows) {
          const key = keyOf(row);
          if (!pageSources.has(key)) pageSources.set(key, new Set());
          pageSources.get(key)!.add(pages[index].number);
        }
      };
      const sourceFor = (key: string): ImportRowSource => ({
        key,
        pages: [...(pageSources.get(key) ?? [])].sort((a, b) => a - b),
      });

      if (config.type === "schedule") {
        const res = await recognizeSchedulesBatch(
          selected,
          config.apiKey,
          config.context,
          {
            ...opts,
            onPageRows: (index, rows: readonly Course[]) =>
              collect(index, rows, courseImportKey),
          },
        );
        usedOfflineFallback = usedOfflineFallback || Boolean(res.usedOfflineFallback);
        result = mergeResults(previous, {
          type: "schedule",
          schedule: res.schedule,
          sources: res.schedule.courses.map((row) =>
            sourceFor(courseImportKey(row)),
          ),
        });
      } else if (config.type === "periods") {
        const res = await recognizePeriodsBatch(selected, config.apiKey, opts);
        usedOfflineFallback = usedOfflineFallback || Boolean(res.usedOfflineFallback);
        result = mergeResults(previous, {
          type: "periods",
          periods: res.periods,
          scheduleId: config.scheduleId,
        });
      } else {
        const res = await recognizeGradesBatch(
          selected,
          config.apiKey,
          config.semester,
          {
            ...opts,
            scale: config.scale,
            types: config.types,
            onPageRows: (index, rows: readonly GradeDraft[]) =>
              collect(index, rows, gradeImportKey),
          },
        );
        usedOfflineFallback = usedOfflineFallback || Boolean(res.usedOfflineFallback);
        result = mergeResults(previous, {
          type: "grades",
          grades: res.grades,
          yearId: config.yearId,
          sources: res.grades.map((row) => sourceFor(gradeImportKey(row))),
        });
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return;
      if (!failed.length) failed.push(...pages);
      if (error instanceof Error) errorMessage = error.message;
    }

    const task = current();
    if (!task || signal?.aborted) return;

    const retry: ImportPageRetry | undefined = failed.length
      ? {
          pages: failed.map((page) => page.number).sort((a, b) => a - b),
          run: async () => {
            const state = useImportTask.getState();
            if (
              state.retry !== retry ||
              state.seq !== seq ||
              state.status === "analyzing"
            ) {
              return;
            }
            const collected =
              state.result?.type === "schedule" ||
              state.result?.type === "grades" ||
              state.result?.type === "periods"
                ? state.result
                : undefined;
            state.open(config.type, `重试 ${failed.length} 张图片`);
            await run(failed, useImportTask.getState().seq, collected);
          },
        }
      : undefined;

    const modePrefix = !usedAI
      ? "离线识别完成："
      : usedOfflineFallback
        ? "识别完成（部分已切换本地离线识别）："
        : "";

    if (!result) {
      task.fail(errorMessage, retry);
    } else if (result.type === "schedule") {
      task.complete(
        result,
        `${modePrefix}已识别 ${result.schedule.courses.length} 门课程，请确认后导入。`,
        retry,
      );
    } else if (result.type === "periods") {
      task.complete(
        result,
        `${modePrefix}已识别 ${result.periods.length} 个作息节次，可修正或删除多余行后再应用。`,
        retry,
      );
    } else {
      const destination =
        config.type === "grades" && config.yearName
          ? `，将导入到「${config.yearName}」`
          : "";
      task.complete(
        result,
        `${modePrefix}已识别 ${result.grades.length} 条成绩${destination}，请确认后导入。`,
        retry,
      );
    }
  };
  await run(
    images.map((image, index) => ({ number: index + 1, image })),
    useImportTask.getState().seq,
  );
}

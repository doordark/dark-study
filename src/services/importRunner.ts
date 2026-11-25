import * as Linking from "expo-linking";
import * as Network from "expo-network";
import { Alert } from "react-native";

import {
  recognizeGrades,
  recognizePeriods,
  recognizeScheduleFromText,
} from "@/services/ai";
import {
  PermissionDeniedError,
  pickImageFromCamera,
  pickImagesFromLibrary,
  pickTextDocument,
  type DocumentFormat,
} from "@/services/fileImport";
import { runImageImportTask } from "@/services/imageImportTask";
import {
  recognizeGradesFromTextOffline,
  recognizePeriodsFromTextOffline,
  recognizeScheduleFromTextOffline,
} from "@/services/offlineImport";
import { useImportTask, type TaskKind } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import type { GradeDraft, Period, Schedule, SemesterKind } from "@/types";
import { toIsoDate } from "@/utils/time";

export type ImportFrom = "image" | "camera" | "text" | "paste";

/** 统一检测网络可用性：连不上或不可达都按离线处理 */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "请求已取消")
  );
}

/** 权限拒绝时弹窗引导直达系统设置，其他素材错误给出清晰提示 */
export function showPickError(error: unknown) {
  if (error instanceof PermissionDeniedError) {
    Alert.alert("需要系统权限", error.message, [
      { text: "取消", style: "cancel" },
      {
        text: "前往设置",
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ]);
    return;
  }
  Alert.alert(
    "读取素材失败",
    error instanceof Error ? error.message : "请重试",
  );
}

function activeScheduleContext() {
  const state = useStore.getState();
  const active =
    state.schedules.find((x) => x.id === state.activeScheduleId) ??
    state.schedules[0];
  return {
    scheduleId: active?.id,
    context: {
      startDate: active?.startDate,
      totalWeeks: active?.totalWeeks,
      today: toIsoDate(new Date()),
      periods: active?.periods,
    },
  };
}

/** 统一文本 / 文档 / 粘贴文本识别入口（课表 / 作息表 / 成绩三模块全覆盖 AI → 离线自动降级） */
export async function runTextImportTask(
  kind: TaskKind,
  text: string,
  opts: {
    sourceLabel: string;
    format?: DocumentFormat;
    semester?: SemesterKind;
    yearId?: string;
    yearName?: string;
  },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    Alert.alert("内容为空", "请先输入或粘贴需要识别的内容");
    return;
  }

  const task = useImportTask.getState();
  if (task.status === "analyzing") {
    task.setExpanded(true);
    return;
  }

  const signal = task.open(kind, opts.sourceLabel);
  const seq = useImportTask.getState().seq;
  const stillActive = () => {
    const s = useImportTask.getState();
    return s.seq === seq && s.status === "analyzing" && !signal.aborted;
  };

  const { apiKey, gpaScale } = useSettings.getState();
  const online = await isDeviceOnline();
  const wantAI = online && !!apiKey;

  try {
    if (kind === "schedule") {
      const { context } = activeScheduleContext();
      const isIcs =
        opts.format === "ics" ||
        (/BEGIN:VCALENDAR/i.test(trimmed) && /BEGIN:VEVENT/i.test(trimmed));
      let schedule: Schedule;
      let usedOffline = !wantAI || isIcs;

      if (isIcs) {
        task.setPhase("正在直接解析 ICS 日历课表…", 45);
        schedule = recognizeScheduleFromTextOffline(trimmed, context);
      } else if (wantAI) {
        try {
          task.setPhase("AI 正在解析课程表内容…", 38);
          schedule = await recognizeScheduleFromText(
            trimmed,
            apiKey,
            context,
            signal,
          );
        } catch (aiError) {
          if (isAbortError(aiError) || !stillActive()) return;
          if (
            aiError instanceof Error &&
            aiError.message.includes("不是课程表")
          ) {
            throw aiError;
          }
          task.setPhase("AI 解析未完成，正在切换本地离线解析…", 62);
          try {
            schedule = recognizeScheduleFromTextOffline(trimmed, context);
            usedOffline = true;
          } catch {
            throw aiError;
          }
        }
      } else {
        task.setPhase("离线模式：正在按规则解析课表…", 45);
        schedule = recognizeScheduleFromTextOffline(trimmed, context);
      }

      if (!stillActive()) return;
      if (!schedule.courses.length) {
        task.fail("未识别到有效课程，请核对文件内容或补充星期与节次后重试");
        return;
      }
      const prefix = isIcs
        ? "日历解析完成"
        : !wantAI
          ? "离线识别完成"
          : usedOffline
            ? "已自动切换离线识别完成"
            : "AI 识别完成";
      task.complete(
        { type: "schedule", schedule },
        `${prefix}：共 ${schedule.courses.length} 门课程，请确认后导入`,
      );
      return;
    }

    if (kind === "periods") {
      const { scheduleId } = activeScheduleContext();
      let periods: Period[];
      let usedOffline = !wantAI;

      if (wantAI) {
        try {
          task.setPhase("AI 正在解析作息节次…", 38);
          periods = await recognizePeriods({ text: trimmed }, apiKey, signal);
        } catch (aiError) {
          if (isAbortError(aiError) || !stillActive()) return;
          if (
            aiError instanceof Error &&
            aiError.message.includes("不是作息表")
          ) {
            throw aiError;
          }
          task.setPhase("AI 解析未完成，正在切换本地离线解析…", 62);
          try {
            periods = recognizePeriodsFromTextOffline(trimmed);
            usedOffline = true;
          } catch {
            throw aiError;
          }
        }
      } else {
        task.setPhase("离线模式：正在解析作息节次…", 45);
        periods = recognizePeriodsFromTextOffline(trimmed);
      }

      if (!stillActive()) return;
      if (!periods.length) {
        task.fail("未识别到有效作息节次，请确认内容包含起止时间后重试");
        return;
      }
      const prefix = !wantAI
        ? "离线识别完成"
        : usedOffline
          ? "已自动切换离线识别完成"
          : "作息表识别完成";
      task.complete(
        { type: "periods", periods, scheduleId },
        `${prefix}：共 ${periods.length} 个节次，可修正或删除多余行后再应用`,
      );
      return;
    }

    // grades
    const store = useStore.getState();
    const semester = opts.semester ?? store.activeGradeSemester;
    const yearId = opts.yearId ?? store.activeGradeYearId;
    const yearName =
      opts.yearName ??
      store.gradeYears.find((y) => y.id === yearId)?.name ??
      "当前学年";
    const gradeTypes = store.gradeTypes;

    let grades: GradeDraft[];
    let usedOffline = !wantAI;
    if (wantAI) {
      try {
        task.setPhase("AI 正在识别课程成绩…", 38);
        grades = await recognizeGrades({ text: trimmed }, apiKey, semester, {
          scale: gpaScale,
          types: gradeTypes,
          signal,
        });
      } catch (aiError) {
        if (isAbortError(aiError) || !stillActive()) return;
        if (
          aiError instanceof Error &&
          aiError.message.includes("不是成绩单")
        ) {
          throw aiError;
        }
        task.setPhase("AI 识别未完成，正在切换本地离线解析…", 62);
        try {
          grades = recognizeGradesFromTextOffline(trimmed, semester, {
            scale: gpaScale,
            types: gradeTypes,
          });
          usedOffline = true;
        } catch {
          throw aiError;
        }
      }
    } else {
      task.setPhase("离线模式：正在解析成绩表格…", 45);
      grades = recognizeGradesFromTextOffline(trimmed, semester, {
        scale: gpaScale,
        types: gradeTypes,
      });
    }

    if (!stillActive()) return;
    if (!grades.length) {
      task.fail("未识别到有效成绩，请核对文本或补充「课程名 / 学分 / 成绩」列后重试");
      return;
    }
    const prefix = !wantAI
      ? "离线识别完成"
      : usedOffline
        ? "已自动切换离线识别完成"
        : "识别完成";
    task.complete(
      { type: "grades", grades, yearId },
      `${prefix}：共 ${grades.length} 条成绩，将导入到「${yearName}」，请确认`,
    );
  } catch (error) {
    if (isAbortError(error) || !stillActive()) return;
    task.fail(error instanceof Error ? error.message : "识别失败，请重试");
  }
}

/** 统一媒体选择 + 识别任务启动入口（相册多选 / 拍照 / 文档导入） */
export async function startMediaImport(
  kind: TaskKind,
  from: Exclude<ImportFrom, "paste">,
  opts?: {
    semester?: SemesterKind;
    yearId?: string;
    yearName?: string;
  },
): Promise<void> {
  const task = useImportTask.getState();
  if (task.status === "analyzing") {
    task.setExpanded(true);
    return;
  }

  try {
    if (from === "text") {
      const doc = await pickTextDocument();
      if (!doc) return;
      await runTextImportTask(kind, doc.text, {
        sourceLabel: doc.name ? `文档「${doc.name}」` : "文档",
        format: doc.format,
        semester: opts?.semester,
        yearId: opts?.yearId,
        yearName: opts?.yearName,
      });
      return;
    }

    const picked =
      from === "image"
        ? await pickImagesFromLibrary(kind === "periods" ? 3 : 9)
        : (() => pickImageFromCamera().then((img) => (img ? [img] : [])))();
    const images = await picked;
    if (!images.length) return;

    const batchImages = images.map((i) => ({
      imageBase64: i.base64,
      mimeType: i.mimeType,
      uri: i.uri,
    }));

    const { apiKey, gpaScale } = useSettings.getState();
    const store = useStore.getState();
    const sourceLabel =
      batchImages.length > 1 ? `${batchImages.length} 张照片` : "照片";

    task.open(kind, sourceLabel);

    if (kind === "schedule") {
      const { context } = activeScheduleContext();
      await runImageImportTask({
        type: "schedule",
        images: batchImages,
        apiKey,
        isOnline: isDeviceOnline,
        context,
      });
      return;
    }

    if (kind === "periods") {
      const { scheduleId } = activeScheduleContext();
      await runImageImportTask({
        type: "periods",
        images: batchImages,
        apiKey,
        isOnline: isDeviceOnline,
        scheduleId,
      });
      return;
    }

    const yearId = opts?.yearId ?? store.activeGradeYearId;
    const yearName =
      opts?.yearName ??
      store.gradeYears.find((y) => y.id === yearId)?.name;
    const semester = opts?.semester ?? store.activeGradeSemester;

    await runImageImportTask({
      type: "grades",
      images: batchImages,
      apiKey,
      isOnline: isDeviceOnline,
      semester,
      yearId,
      yearName,
      scale: gpaScale,
      types: store.gradeTypes,
    });
  } catch (error) {
    showPickError(error);
  }
}

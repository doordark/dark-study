import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Course } from "@/types";
import type { CourseTaskType } from "@/utils/courseTasks";
import { coordinatedJSONStorage } from "@/utils/storage";
import {
  SHORT_BREAK_MINUTES,
  buildFarmRewardForFocus,
  buildFarmRewardForTask,
  computeFocusElapsedSec,
  computeFocusRemainingSec,
  courseIdentityKey,
  makeProgressId,
  normalizeStudyProgressState,
  type ActiveFocusSession,
  type AttendanceRecord,
  type AttendanceStatus,
  type CourseFocusLog,
  type FocusSessionMode,
  type PendingFarmReward,
  type StudyProgressSnapshot,
} from "@/utils/studyProgress";
import { toIsoDate } from "@/utils/time";

export const STUDY_PROGRESS_STORAGE_KEY = "dark-study-study-progress";

const MAX_ATTENDANCE_PER_COURSE = 120;
const MAX_FOCUS_LOGS = 500;
const MAX_PENDING_REWARDS = 100;

export type CourseTarget = Pick<Course, "name" | "teacher"> | string;

export interface StartFocusSessionOptions {
  mode?: FocusSessionMode;
  course: CourseTarget;
  courseName?: string;
  durationMinutes?: number;
  totalSec?: number;
  ambientOn?: boolean;
  notificationId?: string | null;
  now?: number;
}

export interface FocusSessionCompletion {
  mode: FocusSessionMode;
  sessionId: string;
  courseKey: string;
  courseName: string;
  minutes: number;
  log?: CourseFocusLog;
  reward?: PendingFarmReward;
}

export interface StudyProgressState extends StudyProgressSnapshot {
  activeFocusSession: ActiveFocusSession | null;
  recordAttendance: (
    course: CourseTarget,
    status: AttendanceStatus,
    options?: {
      courseName?: string;
      dateIso?: string;
      note?: string;
      at?: number;
    },
  ) => AttendanceRecord;
  removeAttendanceRecord: (courseKey: string, recordId: string) => void;
  setCustomAbsenceLimit: (courseKey: string, limit: number | null) => void;
  recordCourseFocus: (
    course: CourseTarget,
    minutes: number,
    options?: { courseName?: string; at?: number },
  ) => { log: CourseFocusLog; reward: PendingFarmReward };
  queueTaskReward: (
    type: CourseTaskType,
    title: string,
    at?: number,
  ) => PendingFarmReward;
  /** 原子化取出并清空所有待结算的doordoor农场学习奖励 */
  claimPendingFarmRewards: () => PendingFarmReward[];
  /** 启动一轮持久化番茄专注或 5 分钟短休 */
  startFocusSession: (options: StartFocusSessionOptions) => ActiveFocusSession;
  /** 暂停当前专注/短休会话，保留精准剩余秒数 */
  pauseFocusSession: (now?: number) => ActiveFocusSession | null;
  /** 恢复暂停中的专注/短休会话并重新计算 endAt */
  resumeFocusSession: (options?: {
    notificationId?: string | null;
    now?: number;
  }) => ActiveFocusSession | null;
  /** 按真实时间戳同步剩余秒数并检测是否已到期 */
  tickOrSyncFocusSession: (now?: number) => {
    session: ActiveFocusSession | null;
    remainingSec: number;
    completed: boolean;
  };
  /** 原子化结算并清空当前会话（专注模式发放 dark币 奖励，短休模式不计入专注记录） */
  completeActiveFocusSession: (options?: {
    now?: number;
    early?: boolean;
  }) => FocusSessionCompletion | null;
  /** 取消并清空当前活跃会话，返回清理前的会话供取消本地通知 */
  clearFocusSession: () => ActiveFocusSession | null;
  /** 切换当前专注会话的轻音伴读开关 */
  setFocusAmbient: (ambientOn: boolean) => void;
  /** 将异步排程成功的本地通知 ID 绑定到指定会话 */
  setFocusNotificationId: (sessionId: string, notificationId: string | null) => void;
}

function resolveCourseTarget(
  target: CourseTarget,
  fallbackName?: string,
): { courseKey: string; courseName: string } {
  if (typeof target === "string") {
    const key = target.trim();
    const rawName = (fallbackName ?? key.split("::")[0] ?? "未命名课程").trim();
    return {
      courseKey: key || courseIdentityKey({ name: rawName, teacher: "" }),
      courseName: rawName.slice(0, 120) || "未命名课程",
    };
  }
  const cleanName = (target.name ?? fallbackName ?? "未命名课程").trim();
  return {
    courseKey: courseIdentityKey(target),
    courseName: cleanName.slice(0, 120) || "未命名课程",
  };
}

function pickPersistedProgress(s: StudyProgressState): StudyProgressSnapshot {
  return {
    attendanceByCourse: s.attendanceByCourse,
    customAbsenceLimits: s.customAbsenceLimits,
    focusLogs: s.focusLogs,
    pendingFarmRewards: s.pendingFarmRewards,
    ...(s.activeFocusSession ? { activeFocusSession: s.activeFocusSession } : {}),
  };
}

export const useStudyProgress = create<StudyProgressState>()(
  persist(
    (set, get) => ({
      attendanceByCourse: {},
      customAbsenceLimits: {},
      focusLogs: [],
      pendingFarmRewards: [],
      activeFocusSession: null,

      recordAttendance: (course, status, options) => {
        const at =
          typeof options?.at === "number" && Number.isFinite(options.at)
            ? Math.floor(options.at)
            : Date.now();
        const { courseKey, courseName } = resolveCourseTarget(
          course,
          options?.courseName,
        );
        const dateIso =
          options?.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(options.dateIso)
            ? options.dateIso
            : toIsoDate(new Date(at));
        const cleanNote = options?.note?.trim().slice(0, 120);
        const record: AttendanceRecord = {
          id: makeProgressId("att", at),
          courseKey,
          courseName,
          dateIso,
          status,
          ...(cleanNote ? { note: cleanNote } : {}),
          at,
        };
        set((state) => {
          const prev = state.attendanceByCourse[courseKey] ?? [];
          const nextList = [record, ...prev].slice(0, MAX_ATTENDANCE_PER_COURSE);
          return {
            attendanceByCourse: {
              ...state.attendanceByCourse,
              [courseKey]: nextList,
            },
          };
        });
        return record;
      },

      removeAttendanceRecord: (courseKey, recordId) => {
        set((state) => {
          const existing = state.attendanceByCourse[courseKey];
          if (!existing?.length) return state;
          const filtered = existing.filter((item) => item.id !== recordId);
          if (filtered.length === existing.length) return state;
          const nextMap = { ...state.attendanceByCourse };
          if (filtered.length > 0) {
            nextMap[courseKey] = filtered;
          } else {
            delete nextMap[courseKey];
          }
          return { attendanceByCourse: nextMap };
        });
      },

      setCustomAbsenceLimit: (courseKey, limit) => {
        if (!courseKey) return;
        set((state) => {
          const nextLimits = { ...state.customAbsenceLimits };
          if (
            limit === null ||
            typeof limit !== "number" ||
            !Number.isFinite(limit) ||
            limit < 1
          ) {
            delete nextLimits[courseKey];
          } else {
            nextLimits[courseKey] = Math.max(1, Math.min(60, Math.floor(limit)));
          }
          return { customAbsenceLimits: nextLimits };
        });
      },

      recordCourseFocus: (course, minutes, options) => {
        const at =
          typeof options?.at === "number" && Number.isFinite(options.at)
            ? Math.floor(options.at)
            : Date.now();
        const { courseKey, courseName } = resolveCourseTarget(
          course,
          options?.courseName,
        );
        const safeMin = Number.isFinite(minutes)
          ? Math.max(1, Math.min(240, Math.round(minutes)))
          : 25;
        const reward = buildFarmRewardForFocus(safeMin, courseName, at);
        const log: CourseFocusLog = {
          id: makeProgressId("foc", at),
          courseKey,
          courseName,
          minutes: safeMin,
          coinsAwarded: reward.coins,
          at,
        };
        set((state) => ({
          focusLogs: [log, ...state.focusLogs].slice(0, MAX_FOCUS_LOGS),
          pendingFarmRewards: [...state.pendingFarmRewards, reward].slice(
            -MAX_PENDING_REWARDS,
          ),
        }));
        return { log, reward };
      },

      queueTaskReward: (type, title, at = Date.now()) => {
        const safeAt = Number.isFinite(at) ? Math.floor(at) : Date.now();
        const reward = buildFarmRewardForTask(type, title, safeAt);
        set((state) => ({
          pendingFarmRewards: [...state.pendingFarmRewards, reward].slice(
            -MAX_PENDING_REWARDS,
          ),
        }));
        return reward;
      },

      claimPendingFarmRewards: () => {
        const pending = get().pendingFarmRewards;
        if (!pending.length) return [];
        const claimed = [...pending];
        set({ pendingFarmRewards: [] });
        return claimed;
      },

      startFocusSession: (options) => {
        const now =
          typeof options.now === "number" && Number.isFinite(options.now)
            ? Math.floor(options.now)
            : Date.now();
        const mode: FocusSessionMode = options.mode === "break" ? "break" : "focus";
        const { courseKey, courseName } = resolveCourseTarget(
          options.course,
          options.courseName,
        );
        const fallbackMin = mode === "break" ? SHORT_BREAK_MINUTES : 25;
        const totalSec =
          typeof options.totalSec === "number" &&
          Number.isFinite(options.totalSec) &&
          options.totalSec >= 1
            ? Math.min(4 * 3600, Math.round(options.totalSec))
            : Math.max(
                1,
                Math.min(
                  240,
                  Math.round(options.durationMinutes ?? fallbackMin),
                ),
              ) * 60;
        const prevAmbient = get().activeFocusSession?.ambientOn ?? false;
        const session: ActiveFocusSession = {
          id: makeProgressId(mode === "break" ? "brk" : "fcs", now),
          mode,
          courseKey,
          courseName,
          totalSec,
          remainingSec: totalSec,
          endAt: now + totalSec * 1000,
          running: true,
          notificationId: options.notificationId ?? null,
          ambientOn:
            typeof options.ambientOn === "boolean"
              ? options.ambientOn
              : prevAmbient,
          startedAt: now,
        };
        set({ activeFocusSession: session });
        return session;
      },

      pauseFocusSession: (now = Date.now()) => {
        const current = get().activeFocusSession;
        if (!current) return null;
        const ts = Number.isFinite(now) ? Math.floor(now) : Date.now();
        const rem = computeFocusRemainingSec(current, ts);
        const next: ActiveFocusSession = {
          ...current,
          running: false,
          endAt: null,
          remainingSec: rem,
          notificationId: null,
        };
        set({ activeFocusSession: next });
        return next;
      },

      resumeFocusSession: (options) => {
        const current = get().activeFocusSession;
        if (!current) return null;
        const ts =
          typeof options?.now === "number" && Number.isFinite(options.now)
            ? Math.floor(options.now)
            : Date.now();
        if (current.running && current.endAt !== null) {
          const syncedRem = computeFocusRemainingSec(current, ts);
          const next: ActiveFocusSession = {
            ...current,
            remainingSec: syncedRem,
            notificationId:
              options && "notificationId" in options
                ? (options.notificationId ?? null)
                : current.notificationId,
          };
          set({ activeFocusSession: next });
          return next;
        }
        const baseSec =
          current.remainingSec > 0 ? current.remainingSec : current.totalSec;
        const next: ActiveFocusSession = {
          ...current,
          running: true,
          remainingSec: baseSec,
          endAt: ts + baseSec * 1000,
          notificationId:
            options && "notificationId" in options
              ? (options.notificationId ?? null)
              : current.notificationId,
        };
        set({ activeFocusSession: next });
        return next;
      },

      tickOrSyncFocusSession: (now = Date.now()) => {
        const current = get().activeFocusSession;
        if (!current) {
          return { session: null, remainingSec: 0, completed: false };
        }
        const ts = Number.isFinite(now) ? Math.floor(now) : Date.now();
        const remainingSec = computeFocusRemainingSec(current, ts);
        const completed = remainingSec <= 0;
        if (current.running && completed) {
          // 保留 notificationId 供调用方完成结算时取消系统通知，避免提前清零引发竞态
          const next: ActiveFocusSession = {
            ...current,
            remainingSec: 0,
            running: false,
            endAt: null,
          };
          set({ activeFocusSession: next });
          return { session: next, remainingSec: 0, completed: true };
        }
        // 运行中未到期不调用 set，避免每 500ms/1s 触发 AsyncStorage 频繁落盘与无关重渲染
        return { session: current, remainingSec, completed };
      },

      completeActiveFocusSession: (options) => {
        const current = get().activeFocusSession;
        if (!current) return null;
        const ts =
          typeof options?.now === "number" && Number.isFinite(options.now)
            ? Math.floor(options.now)
            : Date.now();
        const settledMinutes = options?.early
          ? Math.max(1, Math.round(computeFocusElapsedSec(current, ts) / 60))
          : Math.max(1, Math.round(current.totalSec / 60));

        if (current.mode === "break") {
          set({ activeFocusSession: null });
          return {
            mode: "break",
            sessionId: current.id,
            courseKey: current.courseKey,
            courseName: current.courseName,
            minutes: settledMinutes,
          };
        }

        const safeMin = Math.max(1, Math.min(240, settledMinutes));
        const reward = buildFarmRewardForFocus(safeMin, current.courseName, ts);
        const log: CourseFocusLog = {
          id: makeProgressId("foc", ts),
          courseKey: current.courseKey,
          courseName: current.courseName,
          minutes: safeMin,
          coinsAwarded: reward.coins,
          at: ts,
        };
        set((state) => ({
          activeFocusSession: null,
          focusLogs: [log, ...state.focusLogs].slice(0, MAX_FOCUS_LOGS),
          pendingFarmRewards: [...state.pendingFarmRewards, reward].slice(
            -MAX_PENDING_REWARDS,
          ),
        }));
        return {
          mode: "focus",
          sessionId: current.id,
          courseKey: current.courseKey,
          courseName: current.courseName,
          minutes: safeMin,
          log,
          reward,
        };
      },

      clearFocusSession: () => {
        const prev = get().activeFocusSession;
        if (!prev) return null;
        set({ activeFocusSession: null });
        return prev;
      },

      setFocusAmbient: (ambientOn) => {
        set((state) => {
          if (!state.activeFocusSession) return state;
          if (state.activeFocusSession.ambientOn === ambientOn) return state;
          return {
            activeFocusSession: {
              ...state.activeFocusSession,
              ambientOn: Boolean(ambientOn),
            },
          };
        });
      },

      setFocusNotificationId: (sessionId, notificationId) => {
        if (!sessionId) return;
        set((state) => {
          const cur = state.activeFocusSession;
          if (!cur || cur.id !== sessionId || !cur.running) return state;
          const cleanId =
            typeof notificationId === "string" && notificationId.trim()
              ? notificationId.trim()
              : null;
          if (cur.notificationId === cleanId) return state;
          return {
            activeFocusSession: {
              ...cur,
              notificationId: cleanId,
            },
          };
        });
      },
    }),
    {
      name: STUDY_PROGRESS_STORAGE_KEY,
      storage: coordinatedJSONStorage<StudyProgressSnapshot>(
        STUDY_PROGRESS_STORAGE_KEY,
      ),
      partialize: pickPersistedProgress,
      merge: (persisted, current) => {
        const normalized = normalizeStudyProgressState(persisted);
        return {
          ...current,
          ...normalized,
          activeFocusSession: normalized.activeFocusSession ?? null,
        };
      },
    },
  ),
);

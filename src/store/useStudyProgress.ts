import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Course } from "@/types";
import type { CourseTaskType } from "@/utils/courseTasks";
import { coordinatedJSONStorage } from "@/utils/storage";
import {
  buildFarmRewardForFocus,
  buildFarmRewardForTask,
  courseIdentityKey,
  makeProgressId,
  normalizeStudyProgressState,
  type AttendanceRecord,
  type AttendanceStatus,
  type CourseFocusLog,
  type PendingFarmReward,
  type StudyProgressSnapshot,
} from "@/utils/studyProgress";
import { toIsoDate } from "@/utils/time";

export const STUDY_PROGRESS_STORAGE_KEY = "dark-study-study-progress";

const MAX_ATTENDANCE_PER_COURSE = 120;
const MAX_FOCUS_LOGS = 500;
const MAX_PENDING_REWARDS = 100;

export type CourseTarget = Pick<Course, "name" | "teacher"> | string;

export interface StudyProgressState extends StudyProgressSnapshot {
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
  /** 原子化取出并清空所有待结算的星露坡学习奖励 */
  claimPendingFarmRewards: () => PendingFarmReward[];
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
  };
}

export const useStudyProgress = create<StudyProgressState>()(
  persist(
    (set, get) => ({
      attendanceByCourse: {},
      customAbsenceLimits: {},
      focusLogs: [],
      pendingFarmRewards: [],

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
        };
      },
    },
  ),
);

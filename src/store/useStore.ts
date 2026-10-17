import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_GPA_RULES, SAMPLE_SCHEDULE } from "@/constants/sample";
import type { Course, GpaRule, GradeRecord, Schedule } from "@/types";
import {
  addDays,
  mondayOf,
  parseIsoDate,
  resolveSemester,
  toIsoDate,
  weeksFromDates,
} from "@/utils/time";

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 只更新当前选中课表 */
const mapActive = (
  s: AppState,
  fn: (schedule: Schedule) => Schedule,
): Partial<AppState> => ({
  schedules: s.schedules.map((x) => (x.id === s.activeScheduleId ? fn(x) : x)),
});

export type ScheduleMetaPatch = Partial<
  Pick<Schedule, "name" | "kind" | "startDate" | "endDate">
>;

interface AppState {
  /** 全部课表（如 "大二下"、"大三上"），可自由命名、切换 */
  schedules: Schedule[];
  /** 当前选中的课表 id */
  activeScheduleId: string;
  grades: GradeRecord[];
  gpaRules: GpaRule[];

  /* ---------------- 课表管理 ---------------- */
  setActiveSchedule: (id: string) => void;
  /** 新建课表（复制当前作息，课程为空），并切换为当前 */
  addSchedule: (name: string) => void;
  removeSchedule: (id: string) => void;
  /** 更新课表信息（命名 / 开学、放假日期），日期变更后自动重算总周数 */
  updateScheduleMeta: (id: string, patch: ScheduleMetaPatch) => void;

  /* ---------------- 当前课表内容 ---------------- */
  /** 应用 DeepSeek 识别出的课表（替换当前课表的课程，保留命名与学期日期） */
  importSchedule: (schedule: Schedule) => void;
  addCourse: (course: Omit<Course, "id">) => string;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  removeCourse: (id: string) => void;
  setPeriods: (periods: Schedule["periods"]) => void;

  /* ---------------- 成绩与绩点 ---------------- */
  addGrade: (grade: Omit<GradeRecord, "id">) => string;
  updateGrade: (id: string, patch: Partial<GradeRecord>) => void;
  removeGrade: (id: string) => void;
  addGpaRule: (rule: Omit<GpaRule, "id">) => string;
  removeGpaRule: (id: string) => void;
  resetToSample: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      schedules: [SAMPLE_SCHEDULE],
      activeScheduleId: SAMPLE_SCHEDULE.id,
      grades: [],
      gpaRules: DEFAULT_GPA_RULES,

      setActiveSchedule: (id) => set({ activeScheduleId: id }),

      addSchedule: (name) =>
        set((s) => {
          const cur =
            s.schedules.find((x) => x.id === s.activeScheduleId) ??
            s.schedules[0];
          const sem = resolveSemester();
          const id = uid();
          return {
            schedules: [
              ...s.schedules,
              {
                id,
                name,
                kind: sem.kind,
                startDate: sem.startDate,
                endDate: sem.endDate,
                totalWeeks: sem.totalWeeks,
                periods: cur.periods,
                courses: [],
              },
            ],
            activeScheduleId: id,
          };
        }),

      removeSchedule: (id) =>
        set((s) => {
          // 至少保留一份课表
          if (s.schedules.length <= 1) return {};
          const schedules = s.schedules.filter((x) => x.id !== id);
          return {
            schedules,
            activeScheduleId:
              s.activeScheduleId === id
                ? schedules[0].id
                : s.activeScheduleId,
          };
        }),

      updateScheduleMeta: (id, patch) =>
        set((s) => ({
          schedules: s.schedules.map((x) => {
            if (x.id !== id) return x;
            // 开学日期自动吸附到所在周的周一
            const startDate = patch.startDate
              ? toIsoDate(mondayOf(parseIsoDate(patch.startDate)))
              : x.startDate;
            let endDate = patch.endDate ?? x.endDate;
            // 放假必须晚于开学，至少留一周
            if (parseIsoDate(endDate) <= parseIsoDate(startDate)) {
              endDate = toIsoDate(addDays(parseIsoDate(startDate), 6));
            }
            return {
              ...x,
              ...patch,
              startDate,
              endDate,
              totalWeeks: weeksFromDates(startDate, endDate),
            };
          }),
        })),

      importSchedule: (incoming) =>
        set((s) =>
          mapActive(s, (cur) => ({
            ...cur,
            courses: incoming.courses,
            periods: incoming.periods.length ? incoming.periods : cur.periods,
          })),
        ),

      addCourse: (course) => {
        const id = uid();
        set((s) =>
          mapActive(s, (cur) => ({
            ...cur,
            courses: [...cur.courses, { ...course, id }],
          })),
        );
        return id;
      },

      updateCourse: (id, patch) =>
        set((s) =>
          mapActive(s, (cur) => ({
            ...cur,
            courses: cur.courses.map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
          })),
        ),

      removeCourse: (id) =>
        set((s) =>
          mapActive(s, (cur) => ({
            ...cur,
            courses: cur.courses.filter((c) => c.id !== id),
          })),
        ),

      setPeriods: (periods) =>
        set((s) => mapActive(s, (cur) => ({ ...cur, periods }))),

      addGrade: (grade) => {
        const id = uid();
        set((s) => ({ grades: [...s.grades, { ...grade, id }] }));
        return id;
      },

      updateGrade: (id, patch) =>
        set((s) => ({
          grades: s.grades.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),

      removeGrade: (id) =>
        set((s) => ({ grades: s.grades.filter((g) => g.id !== id) })),

      addGpaRule: (rule) => {
        const id = uid();
        set((s) => ({ gpaRules: [...s.gpaRules, { ...rule, id }] }));
        return id;
      },

      removeGpaRule: (id) =>
        set((s) => ({ gpaRules: s.gpaRules.filter((r) => r.id !== id) })),

      resetToSample: () =>
        set({
          schedules: [SAMPLE_SCHEDULE],
          activeScheduleId: SAMPLE_SCHEDULE.id,
          grades: [],
          gpaRules: DEFAULT_GPA_RULES,
        }),
    }),
    {
      name: "courseflow-storage",
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Record<string, any>;
        let legacy = s.schedule as Schedule | undefined;

        // v<1：旧版本无学期字段，按当前日期补全（上/下/短三种学期）
        if (legacy && (version < 1 || legacy.kind === undefined)) {
          const sem = resolveSemester();
          legacy = {
            ...legacy,
            kind: sem.kind,
            totalWeeks: sem.totalWeeks,
            name: legacy.name ?? sem.name,
            startDate: legacy.startDate ?? sem.startDate,
          };
        }

        // v<2：单课表 -> 多课表（补 id / endDate）
        if (version < 2 || (!s.schedules && legacy)) {
          const base = legacy ?? SAMPLE_SCHEDULE;
          const startDate = base.startDate ?? SAMPLE_SCHEDULE.startDate;
          const endDate =
            base.endDate ??
            toIsoDate(
              addDays(parseIsoDate(startDate), (base.totalWeeks ?? 18) * 7 - 1),
            );
          const full: Schedule = {
            id: base.id ?? "default",
            name: base.name ?? SAMPLE_SCHEDULE.name,
            kind: base.kind ?? SAMPLE_SCHEDULE.kind,
            startDate,
            endDate,
            totalWeeks: weeksFromDates(startDate, endDate),
            periods: base.periods ?? SAMPLE_SCHEDULE.periods,
            courses: base.courses ?? [],
          };
          s.schedules = [full];
          s.activeScheduleId = full.id;
          delete s.schedule;
        }

        return s as unknown as AppState;
      },
    },
  ),
);

/** 当前选中的课表 */
export const useActiveSchedule = (): Schedule =>
  useStore(
    (s) =>
      s.schedules.find((x) => x.id === s.activeScheduleId) ??
      s.schedules[0] ??
      SAMPLE_SCHEDULE,
  );

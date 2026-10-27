import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_GRADE_RULES, DEFAULT_GRADE_TYPES, DEFAULT_GRADE_YEARS, SAMPLE_SCHEDULE } from "@/constants/sample";
import type {
  Course,
  GradeRecord,
  GradeRule,
  GradeType,
  GradeYear,
  MergeReport,
  Schedule,
  SemesterKind,
} from "@/types";
import {
  addDays,
  findConflicts,
  getCourseTime,
  mapWeeks,
  mondayOf,
  parseIsoDate,
  periodAtTime,
  periodEndingAtTime,
  resolveSemester,
  toIsoDate,
  weeksFromDates,
} from "@/utils/time";
import { migratingStorage } from "@/utils/storage";
import { normalizeGradeInput } from "@/utils/grades";

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * 保证课程 id 唯一且非空。
 * AI 识别产出的课程 id 为空串，直接入库会让列表 key 全部重复
 * （React 每次渲染都报 key 错误，且编辑/冲突标记会错乱），入库前统一补齐。
 */
const rekeyCourses = (courses: Course[]): Course[] => {
  const seen = new Set<string>();
  return courses.map((c) => {
    const id = c.id && !seen.has(c.id) ? c.id : uid();
    seen.add(id);
    return id === c.id ? c : { ...c, id };
  });
};

/**
 * 同一门课可能按每次上课拆成多条记录（如周一 3-4 节 + 周三 1-2 节），
 * 判定为同一门课：名称 + 教师 + 教室一致。
 */
const sameIdentity = (a: Course, b: Course) =>
  a.name === b.name && a.teacher === b.teacher && a.classroom === b.classroom;

/** 同一门课的共享字段：改动需同步到该课的全部上课时间记录 */
const SHARED_FIELDS = [
  "name",
  "teacher",
  "classroom",
  "color",
  "credits",
  "note",
] as const;

/** 从 patch 中挑出共享字段（时间字段 weekday/节次/周次 不同步，仅改本条） */
const pickShared = (patch: Partial<Course>): Partial<Course> => {
  const out: Partial<Course> = {};
  for (const k of SHARED_FIELDS) {
    const v = patch[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

/** 只更新当前选中课表 */
const mapActive = (
  s: AppState,
  fn: (schedule: Schedule) => Schedule,
): Partial<AppState> => ({
  schedules: s.schedules.map((x) => (x.id === s.activeScheduleId ? fn(x) : x)),
});

/**
 * 融合计划（纯计算）：把 src 的课程换算进 dst 的作息节次与周数，
 * 时间按真实时刻映射、周数按真实日期对齐，合并后全量冲突检测。
 */
function planMerge(
  dst: Schedule,
  src: Schedule,
): { merged: Course[]; report: MergeReport } {
  let skipped = 0;
  const added: Course[] = [];
  for (const c of src.courses) {
    // 时间换算：源节次的真实时刻 -> 目标作息的节次
    const { startTime, endTime } = getCourseTime(
      src.periods,
      c.startPeriod,
      c.endPeriod,
    );
    const startP = periodAtTime(dst.periods, startTime);
    const endP = periodEndingAtTime(dst.periods, endTime);
    if (startP == null || endP == null) {
      skipped++;
      continue;
    }
    // 周数换算：开学日期相同时直接沿用，否则按真实日期对齐
    const weeks =
      src.startDate === dst.startDate
        ? [
            ...new Set(c.weeks.filter((w) => w >= 1 && w <= dst.totalWeeks)),
          ].sort((a, b) => a - b)
        : mapWeeks(
            c.weeks,
            c.weekday,
            src.startDate,
            dst.startDate,
            dst.totalWeeks,
          );
    if (!weeks.length) {
      skipped++;
      continue;
    }
    added.push({
      ...c,
      id: uid(),
      startPeriod: startP,
      endPeriod: Math.max(startP, endP),
      weeks,
    });
  }

  // 冲突检测（合并后的全量课程）
  const merged = [...dst.courses, ...added];
  const conflictMap = findConflicts(merged);
  const pairs = new Set<string>();
  for (const [id, names] of conflictMap) {
    const me = merged.find((x) => x.id === id);
    if (!me) continue;
    for (const n of names) pairs.add([me.name, n].sort().join(" × "));
  }

  return {
    merged,
    report: { added: added.length, skipped, conflicts: [...pairs] },
  };
}

export type ScheduleMetaPatch = Partial<
  Pick<Schedule, "name" | "kind" | "startDate" | "endDate">
>;

interface AppState {
  /** 全部课表（如 "大二下"、"大三上"），可自由命名、切换 */
  schedules: Schedule[];
  /** 当前选中的课表 id */
  activeScheduleId: string;
  grades: GradeRecord[];
  /** 学年分组（如「大一」「大二」），可自由命名、删除，内部再分上 / 下 / 短 */
  gradeYears: GradeYear[];
  /** 当前选中的学年 id（导入成绩时作为默认归属学年） */
  activeGradeYearId: string;
  /** 课程类型（必修 / 选修 / 通识选修 / 自定义） */
  gradeTypes: GradeType[];
  /** 成绩计算规则（如「保研绩点」） */
  gradeRules: GradeRule[];
  /** 当前使用的计算规则 */
  activeGradeRuleId: string;
  /** 当前浏览的学期（总成绩页不写入，导入成绩时作为归属学期） */
  activeGradeSemester: SemesterKind;

  /* ---------------- 课表管理 ---------------- */
  setActiveSchedule: (id: string) => void;
  /** 新建课表（复制当前作息，课程为空），并切换为当前 */
  addSchedule: (name: string) => void;
  removeSchedule: (id: string) => void;
  /** 更新课表信息（命名 / 开学、放假日期），日期变更后自动重算总周数 */
  updateScheduleMeta: (id: string, patch: ScheduleMetaPatch) => void;
  /**
   * 把另一份课表（id 或名称）合并进当前课表：
   * 课程时间按真实时刻换算到当前作息，周数按真实日期换算，冲突在报告中列出。
   */
  mergeSchedule: (sourceIdOrName: string) => MergeReport;
  /**
   * 把识别出的课表融合进当前课表（时间/周数换算同 mergeSchedule）。
   * opts.dryRun 为 true 时只做冲突预检，不写库。
   */
  mergeIncoming: (
    incoming: Schedule,
    opts?: { dryRun?: boolean },
  ) => MergeReport;

  /* ---------------- 当前课表内容 ---------------- */
  /** 应用 DeepSeek 识别出的课表（替换当前课表的课程，保留命名与学期日期） */
  importSchedule: (schedule: Schedule) => void;
  /** 把识别出的课表存为一份新课表，并切换为当前 */
  addScheduleWithData: (incoming: Schedule) => string;
  addCourse: (course: Omit<Course, "id">) => string;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  removeCourse: (id: string) => void;
  /** 只删除当前这一条上课记录（同一门课的其他时段保留） */
  removeCourseOnce: (id: string) => void;
  setPeriods: (periods: Schedule["periods"]) => void;

  /* ---------------- 成绩与绩点 ---------------- */
  addGrade: (grade: Omit<GradeRecord, "id">) => string;
  updateGrade: (id: string, patch: Partial<GradeRecord>) => void;
  removeGrade: (id: string) => void;
  /** 批量删除成绩（勾选删除 / 清空学期） */
  removeGrades: (ids: string[]) => void;
  /** 新建学年并切换为当前，返回学年 id */
  addGradeYear: (name: string) => string;
  /** 重命名学年 */
  updateGradeYear: (id: string, name: string) => void;
  /** 删除学年：该学年下的成绩一并移除，至少保留一个学年 */
  removeGradeYear: (id: string) => void;
  setActiveGradeYear: (id: string) => void;
  /** 添加课程类型，返回类型 id（同名的直接复用） */
  addGradeType: (name: string) => string;
  /** 删除课程类型：相关成绩归入剩余的第一个类型，并从规则排除项中移除 */
  removeGradeType: (id: string) => void;
  /** 新建计算规则并切换为当前，返回规则 id */
  addGradeRule: (name: string) => string;
  updateGradeRule: (id: string, patch: Partial<GradeRule>) => void;
  removeGradeRule: (id: string) => void;
  setActiveGradeRule: (id: string) => void;
  setActiveGradeSemester: (semester: SemesterKind) => void;
  resetToSample: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      schedules: [SAMPLE_SCHEDULE],
      activeScheduleId: SAMPLE_SCHEDULE.id,
      grades: [],
      gradeYears: DEFAULT_GRADE_YEARS.map((y) => ({ ...y })),
      activeGradeYearId: DEFAULT_GRADE_YEARS[0].id,
      gradeTypes: DEFAULT_GRADE_TYPES,
      gradeRules: DEFAULT_GRADE_RULES,
      activeGradeRuleId: DEFAULT_GRADE_RULES[0].id,
      activeGradeSemester: resolveSemester().kind,

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
              s.activeScheduleId === id ? schedules[0].id : s.activeScheduleId,
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

      mergeSchedule: (sourceIdOrName) => {
        const s = get();
        const src = s.schedules.find(
          (x) => x.id === sourceIdOrName || x.name === sourceIdOrName,
        );
        const dst =
          s.schedules.find((x) => x.id === s.activeScheduleId) ??
          s.schedules[0];
        const empty: MergeReport = { added: 0, skipped: 0, conflicts: [] };
        if (!src || !dst || src.id === dst.id) return empty;

        const { merged, report } = planMerge(dst, src);
        set({
          schedules: s.schedules.map((x) =>
            x.id === dst.id ? { ...x, courses: merged } : x,
          ),
        });
        return report;
      },

      mergeIncoming: (incoming, opts) => {
        const s = get();
        const dst =
          s.schedules.find((x) => x.id === s.activeScheduleId) ??
          s.schedules[0];
        const empty: MergeReport = { added: 0, skipped: 0, conflicts: [] };
        if (!dst || !incoming?.courses?.length) return empty;

        const { merged, report } = planMerge(dst, incoming);
        if (!opts?.dryRun) {
          set({
            schedules: s.schedules.map((x) =>
              x.id === dst.id ? { ...x, courses: merged } : x,
            ),
          });
        }
        return report;
      },

      importSchedule: (incoming) =>
        set((s) =>
          mapActive(s, (cur) => ({
            ...cur,
            courses: rekeyCourses(incoming.courses),
            periods: incoming.periods.length ? incoming.periods : cur.periods,
          })),
        ),

      addScheduleWithData: (incoming) => {
        const id = uid();
        set((s) => ({
          schedules: [
            ...s.schedules,
            {
              ...incoming,
              id,
              courses: rekeyCourses(incoming.courses),
              name:
                incoming.name?.trim() || `导入课表 ${s.schedules.length + 1}`,
            },
          ],
          activeScheduleId: id,
        }));
        return id;
      },

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
          mapActive(s, (cur) => {
            const target = cur.courses.find((c) => c.id === id);
            if (!target) return cur;
            // 共享字段（名称/教师/教室/颜色/学分/备注）同步到同一门课的
            // 全部上课时间记录，保证日视图/周视图/AI 修改看到同一份数据；
            // 时间字段（星期/节次/周次）只改本条记录
            const shared = pickShared(patch);
            return {
              ...cur,
              courses: cur.courses.map((c) => {
                if (c.id === id) return { ...c, ...patch };
                return sameIdentity(c, target) ? { ...c, ...shared } : c;
              }),
            };
          }),
        ),

      removeCourse: (id) =>
        set((s) =>
          mapActive(s, (cur) => {
            const target = cur.courses.find((c) => c.id === id);
            if (!target) return cur;
            // 「删除课程」= 删除整门课（含其全部上课时间记录）
            return {
              ...cur,
              courses: cur.courses.filter((c) => !sameIdentity(c, target)),
            };
          }),
        ),

      removeCourseOnce: (id) =>
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

      removeGrades: (ids) =>
        set((s) => {
          const drop = new Set(ids);
          return { grades: s.grades.filter((g) => !drop.has(g.id)) };
        }),

      addGradeYear: (name) => {
        const id = `year-${uid()}`;
        set((s) => ({
          gradeYears: [
            ...s.gradeYears,
            { id, name: name.trim() || `学年 ${s.gradeYears.length + 1}` },
          ],
          activeGradeYearId: id,
        }));
        return id;
      },

      updateGradeYear: (id, name) =>
        set((s) => ({
          gradeYears: s.gradeYears.map((y) =>
            y.id === id ? { ...y, name: name.trim() || y.name } : y,
          ),
        })),

      removeGradeYear: (id) =>
        set((s) => {
          // 至少保留一个学年，避免成绩无处归属
          if (s.gradeYears.length <= 1) return {};
          const gradeYears = s.gradeYears.filter((y) => y.id !== id);
          const removedIds = new Set(
            s.grades.filter((g) => g.yearId === id).map((g) => g.id),
          );
          return {
            gradeYears,
            activeGradeYearId:
              s.activeGradeYearId === id
                ? gradeYears[0].id
                : s.activeGradeYearId,
            grades: s.grades.filter((g) => g.yearId !== id),
            gradeRules: s.gradeRules.map((r) => ({
              ...r,
              excludedCourseIds: r.excludedCourseIds.filter(
                (cid) => !removedIds.has(cid),
              ),
            })),
          };
        }),

      setActiveGradeYear: (id) => set({ activeGradeYearId: id }),

      addGradeType: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return "";
        const existing = get().gradeTypes.find((t) => t.name === trimmed);
        if (existing) return existing.id;
        const id = `type-${uid()}`;
        set((s) => ({
          gradeTypes: [...s.gradeTypes, { id, name: trimmed }],
        }));
        return id;
      },

      removeGradeType: (id) =>
        set((s) => {
          const gradeTypes = s.gradeTypes.filter((t) => t.id !== id);
          // 至少保留一个类型
          if (!gradeTypes.length) return {};
          const fallbackId = gradeTypes[0].id;
          return {
            gradeTypes,
            grades: s.grades.map((g) =>
              g.type === id ? { ...g, type: fallbackId } : g,
            ),
            gradeRules: s.gradeRules.map((r) => ({
              ...r,
              excludedTypes: r.excludedTypes.filter((t) => t !== id),
            })),
          };
        }),

      addGradeRule: (name) => {
        const id = uid();
        set((s) => ({
          gradeRules: [
            ...s.gradeRules,
            {
              id,
              name: name.trim() || `规则 ${s.gradeRules.length + 1}`,
              excludedTypes: [],
              excludedCourseIds: [],
            },
          ],
          activeGradeRuleId: id,
        }));
        return id;
      },

      updateGradeRule: (id, patch) =>
        set((s) => ({
          gradeRules: s.gradeRules.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        })),

      removeGradeRule: (id) =>
        set((s) => {
          // 至少保留一条规则
          if (s.gradeRules.length <= 1) return {};
          const gradeRules = s.gradeRules.filter((r) => r.id !== id);
          return {
            gradeRules,
            activeGradeRuleId:
              s.activeGradeRuleId === id
                ? gradeRules[0].id
                : s.activeGradeRuleId,
          };
        }),

      setActiveGradeRule: (id) => set({ activeGradeRuleId: id }),

      setActiveGradeSemester: (semester) =>
        set({ activeGradeSemester: semester }),

      resetToSample: () =>
        set({
          schedules: [SAMPLE_SCHEDULE],
          activeScheduleId: SAMPLE_SCHEDULE.id,
          grades: [],
          gradeYears: DEFAULT_GRADE_YEARS.map((y) => ({ ...y })),
          activeGradeYearId: DEFAULT_GRADE_YEARS[0].id,
          gradeTypes: DEFAULT_GRADE_TYPES,
          gradeRules: DEFAULT_GRADE_RULES,
          activeGradeRuleId: DEFAULT_GRADE_RULES[0].id,
          activeGradeSemester: resolveSemester().kind,
        }),
    }),
    {
      name: "dark-study-storage",
      version: 6,
      storage: createJSONStorage(() => migratingStorage("courseflow-storage")),
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

        // v<4：强制修复课程空 id / 重复 id（v3 存量与新导入统一覆盖，
        // 否则列表 key 重复、编辑错乱、同一门课无法同步）
        if (version < 4 && Array.isArray(s.schedules)) {
          s.schedules = (s.schedules as Schedule[]).map((x) => ({
            ...x,
            courses: rekeyCourses(x.courses ?? []),
          }));
        }

        // v<5：成绩升级为「学期 + 课程类型 + 命名计算规则」结构。
        // 旧版百分制分数 / 等第 / includedInGpa 统一迁移，绩点按分数换算补齐。
        if (version < 5) {
          s.gradeTypes = DEFAULT_GRADE_TYPES.map((t) => ({ ...t }));
          s.gradeRules = DEFAULT_GRADE_RULES.map((r) => ({
            ...r,
            excludedTypes: [],
            excludedCourseIds: [],
          }));
          s.activeGradeRuleId = s.gradeRules[0].id;
          s.activeGradeSemester = resolveSemester().kind;
          s.grades = (Array.isArray(s.grades) ? s.grades : [])
            .map((g: any) => {
              const normalized = normalizeGradeInput({
                ...g,
                semester: g?.semester ?? resolveSemester().kind,
              });
              if (!normalized) return null;
              return { id: g?.id || uid(), ...normalized };
            })
            .filter(Boolean);
          delete s.gpaRules;
        }

        // v<6：成绩新增「学年」分组，存量成绩统一归入默认学年
        if (version < 6) {
          if (!Array.isArray(s.gradeYears) || !s.gradeYears.length) {
            s.gradeYears = DEFAULT_GRADE_YEARS.map((y) => ({ ...y }));
          }
          if (
            !s.activeGradeYearId ||
            !(s.gradeYears as GradeYear[]).some(
              (y) => y.id === s.activeGradeYearId,
            )
          ) {
            s.activeGradeYearId = (s.gradeYears as GradeYear[])[0].id;
          }
          const fallbackYearId = (s.gradeYears as GradeYear[])[0].id;
          s.grades = (Array.isArray(s.grades) ? s.grades : []).map(
            (g: GradeRecord) => ({ ...g, yearId: g.yearId || fallbackYearId }),
          );
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

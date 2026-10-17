/** 课程主题色 */
export type CourseColor =
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan";

/** 一门课程 */
export interface Course {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  /** 星期几：1 = 周一 ... 7 = 周日 */
  weekday: number;
  /** 起始节次（含） */
  startPeriod: number;
  /** 结束节次（含） */
  endPeriod: number;
  /** 上课周次，如 [1,2,3,4] */
  weeks: number[];
  color: CourseColor;
  credits?: number;
  note?: string;
}

/** 一节作息时间 */
export interface Period {
  index: number;
  /** 节次名，如 "1-2节" */
  label: string;
  startTime: string;
  endTime: string;
}

/** 学期类型：上学期（秋季）/ 下学期（春季）/ 短学期（小学期） */
export type SemesterKind = "fall" | "spring" | "summer";

/** 完整课表（支持多份并存、自由命名，如 "大二下"） */
export interface Schedule {
  id: string;
  /** 课表名称（用户自定义），如 "大二下" */
  name: string;
  /** 学期类型 */
  kind: SemesterKind;
  /** 开学日期（自动吸附到所在周的周一），ISO 日期 yyyy-MM-dd */
  startDate: string;
  /** 放假（课程结束）日期，ISO 日期 yyyy-MM-dd */
  endDate: string;
  /** 学期总周数：由开学/放假日期推导 */
  totalWeeks: number;
  periods: Period[];
  courses: Course[];
}

/** 成绩记录 */
export interface GradeRecord {
  id: string;
  name: string;
  credit: number;
  /** 百分制成绩，可为空（只记录等第） */
  score: number | null;
  /** 等第，如 A+ / B / 通过 */
  grade: string | null;
  semester: string;
  /** 必修 / 选修 / 其他 */
  type: "required" | "elective" | "other";
  /** 是否计入绩点 */
  includedInGpa: boolean;
}

/** 绩点换算档位 */
export interface GpaBand {
  grade: string;
  minScore: number;
  maxScore: number;
  gpa: number;
}

/** 绩点规则（如"保研绩点"、"出国 4.0 制"） */
export interface GpaRule {
  id: string;
  name: string;
  bands: GpaBand[];
  /** weighted = 按学分加权平均；simple = 简单平均 */
  formula: "weighted" | "simple";
  description?: string;
}

/** 课表助手消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 助手建议的课表操作，供用户一键应用 */
  action?: ScheduleAction;
  timestamp: number;
}

/** 助手可执行的课表操作 */
export type ScheduleAction =
  | { type: "add"; course: Omit<Course, "id"> }
  | { type: "remove"; courseId: string; courseName: string }
  | {
      type: "update";
      courseId: string;
      courseName: string;
      patch: Partial<Course>;
    };

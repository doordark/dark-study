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

/** 分数录入方式：百分制数字 / 字母等级 / 文字等级 */
export type GradeScoreType = "numeric" | "letter" | "text";

/** 学年分组（可自由命名，如「大一」「2024-2025学年」），内部再分上 / 下 / 短学期 */
export interface GradeYear {
  id: string;
  name: string;
}

/** 成绩记录 */
export interface GradeRecord {
  id: string;
  name: string;
  /** 学分；成绩单没有学分列时为 null，由用户后续补填 */
  credit: number | null;
  /** 分数类型 */
  scoreType: GradeScoreType;
  /** 原始分数，按上传内容原样展示，如 "87" / "A" / "优秀" */
  score: string;
  /** 绩点（识别自成绩单，或由分数换算），无法换算时为 null */
  gpa: number | null;
  /** 所属学年 id */
  yearId: string;
  /** 所属学期 */
  semester: SemesterKind;
  /** 课程类型 id（必修课 / 选修课 / 通识选修课 / 用户自定义） */
  type: string;
}

/** 识别/解析产出的成绩草稿：入库时才补 id 与所属学年 */
export type GradeDraft = Omit<GradeRecord, "id" | "yearId">;

/** 课程类型 */
export interface GradeType {
  id: string;
  name: string;
}

/** 成绩计算规则：命名后可反复切换，如「综测绩点」「保研绩点」 */
export interface GradeRule {
  id: string;
  name: string;
  /** 不计入的课程类型 id（规则里一键排除） */
  excludedTypes: string[];
  /** 手动勾除的课程 id */
  excludedCourseIds: string[];
}

/** 联网检索来源 */
export interface ChatSource {
  title: string;
  url: string;
}

/** 大爹专属：大肥鱼除改课表外的权限 */
export type WhaleAction =
  /** 修改召唤口令 */
  | { type: "set_summon_phrase"; phrase: string }
  /** 修改软件背景色调 / 光效 */
  | { type: "set_background"; tint: string; effect?: string }
  /** 联网找资料（随后会二次生成回答） */
  | { type: "web_search"; query: string }
  /** 生成图片 */
  | {
      type: "generate_image";
      prompt: string;
      size?: "square" | "portrait" | "landscape";
    };

/** 助手消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 助手建议的课表操作（可批量），供用户一键应用 */
  actions?: ScheduleAction[];
  /** 大肥鱼生成的图片地址 */
  imageUri?: string;
  /** 图片宽高比（宽 / 高） */
  imageAspect?: number;
  /** 联网检索引用 */
  sources?: ChatSource[];
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
    }
  /** 新建一份课表（如「外教课」），并切换为当前 */
  | { type: "create_schedule"; scheduleName: string }
  /** 把另一份课表的课程合并进当前课表（时间/周数自动换算） */
  | { type: "merge_schedule"; sourceScheduleName: string };

/** 助手可执行的完整操作：课表操作 + 大爹专属权限 */
export type AssistantAction = ScheduleAction | WhaleAction;

/** 课表合并结果报告 */
export interface MergeReport {
  /** 成功并入的课程数 */
  added: number;
  /** 因时间/周数无法映射而跳过的课程数 */
  skipped: number;
  /** 冲突描述，如 ["高等数学 × 大学英语"] */
  conflicts: string[];
}

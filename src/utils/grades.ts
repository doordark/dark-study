import type {
  GradeDraft,
  GradeRecord,
  GradeRule,
  GradeScoreType,
  SemesterKind,
} from "@/types";

/** 成绩页的学期分页：总成绩 + 上 / 下 / 短三个学期 */
export const GRADE_SEMESTERS: { kind: SemesterKind; label: string }[] = [
  { kind: "fall", label: "上学期" },
  { kind: "spring", label: "下学期" },
  { kind: "summer", label: "短学期" },
];

export const semesterLabel = (kind: SemesterKind): string =>
  GRADE_SEMESTERS.find((s) => s.kind === kind)?.label ?? "学期";

/** 识别结果里的学期写法统一到 SemesterKind */
export function normalizeSemester(input: unknown): SemesterKind | null {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "fall" || /上|秋|第一|1学期/.test(raw)) return "fall";
  if (raw === "spring" || /下|春|第二|2学期/.test(raw)) return "spring";
  if (raw === "summer" || /短|夏|小学期|第三|3学期/.test(raw)) return "summer";
  return null;
}

/** 字母等级 → 常见 4.0 制绩点 */
const LETTER_GPA: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.5,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0,
};

/** 文字等级 → 常见 4.0 制绩点 */
const TEXT_GPA: Record<string, number> = {
  优秀: 4.0,
  良好: 3.5,
  中等: 2.5,
  及格: 1.5,
  不及格: 0,
  // 「合格 / 通过」类通常不计入绩点
};

/**
 * 百分制分数 → 绩点：60 分起算 1.0，每高 1 分加 0.1
 * （60 → 1.0，80 → 3.0，85 → 3.5，100 → 5.0），低于 60 记 0
 */
export function numericScoreToGpa(score: number): number {
  if (!Number.isFinite(score) || score < 60) return 0;
  return Math.round((1 + (score - 60) * 0.1) * 10) / 10;
}

/** 判断原始分数的展示类型 */
export function detectScoreType(raw: string): GradeScoreType {
  const text = raw.trim();
  if (!text) return "numeric";
  const num = Number(text);
  if (text !== "" && Number.isFinite(num)) return "numeric";
  if (LETTER_GPA[text.toUpperCase()] != null) return "letter";
  if (
    TEXT_GPA[text] != null ||
    /通过|合格|不合格|未通过|缓考|免修/.test(text)
  ) {
    return "text";
  }
  return "text";
}

/** 由分数换算绩点；无法换算返回 null */
export function deriveGpa(
  scoreType: GradeScoreType,
  score: string,
): number | null {
  const text = score.trim();
  if (!text) return null;
  if (scoreType === "numeric") {
    const n = Number(text);
    return Number.isFinite(n) ? numericScoreToGpa(n) : null;
  }
  if (scoreType === "letter") {
    return LETTER_GPA[text.toUpperCase()] ?? null;
  }
  return TEXT_GPA[text] ?? null;
}

/** 绩点保留两位小数用于统计展示 */
export const formatGpa = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

/** 单门课程绩点展示：保留一位小数 */
export const formatCourseGpa = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "--" : value.toFixed(1);

/** 课程是否计入当前计算规则 */
export function isGradeIncluded(
  rule: GradeRule | undefined,
  grade: GradeRecord,
): boolean {
  if (!rule) return true;
  return (
    !rule.excludedTypes.includes(grade.type) &&
    !rule.excludedCourseIds.includes(grade.id)
  );
}

export interface GradeStats {
  /** 学分加权平均绩点 */
  value: number | null;
  /** 计入的学分总数 */
  credits: number;
  /** 计入的课程数 */
  count: number;
  /** 当前范围内全部课程数 */
  total: number;
  /** 缺少绩点、无法计入的课程数 */
  missing: number;
  /** 缺少学分、暂未计入加权计算的课程数 */
  missingCredit: number;
}

/** 学分加权平均绩点：Σ(绩点 × 学分) / Σ学分 */
export function calcGradeStats(
  rule: GradeRule | undefined,
  grades: GradeRecord[],
): GradeStats {
  let weighted = 0;
  let credits = 0;
  let count = 0;
  let missing = 0;
  let missingCredit = 0;

  for (const grade of grades) {
    if (!isGradeIncluded(rule, grade)) continue;
    if (grade.gpa == null || !Number.isFinite(grade.gpa)) {
      missing += 1;
      continue;
    }
    const credit = Number(grade.credit);
    if (grade.credit == null || !Number.isFinite(credit) || credit <= 0) {
      missingCredit += 1;
      continue;
    }
    weighted += grade.gpa * credit;
    credits += credit;
    count += 1;
  }

  return {
    value: credits > 0 ? weighted / credits : null,
    credits: Math.round(credits * 100) / 100,
    count,
    total: grades.length,
    missing,
    missingCredit,
  };
}

/** 规范化一条识别/迁移来的成绩（补全类型、绩点与学期；学年由入库方补上） */
export function normalizeGradeInput(input: {
  name?: unknown;
  credit?: unknown;
  score?: unknown;
  grade?: unknown;
  scoreType?: unknown;
  gpa?: unknown;
  type?: unknown;
  semester?: unknown;
}): GradeDraft | null {
  const name = String(input.name ?? "").trim();
  if (!name) return null;

  // 学分允许暂缺（很多成绩单只有课程名 + 成绩），留空待用户补填
  const creditNum = Number(input.credit);
  const credit =
    input.credit != null &&
    String(input.credit).trim() !== "" &&
    Number.isFinite(creditNum) &&
    creditNum > 0
      ? creditNum
      : null;

  const rawScore = input.score != null ? String(input.score).trim() : "";
  const legacyGrade =
    input.grade != null && String(input.grade).trim() !== ""
      ? String(input.grade).trim()
      : "";
  const score = rawScore || legacyGrade;

  const gpaRaw = Number(input.gpa);
  const hasGpa =
    input.gpa != null && Number.isFinite(gpaRaw) && gpaRaw >= 0 && gpaRaw <= 5;
  // 分数与绩点至少提供一项
  if (!score && !hasGpa) return null;

  const declaredType: GradeScoreType =
    input.scoreType === "numeric" ||
    input.scoreType === "letter" ||
    input.scoreType === "text"
      ? input.scoreType
      : detectScoreType(score);
  // 声明为百分制但实际是字母/文字时自动纠正，避免绩点换算失败
  const scoreType: GradeScoreType =
    declaredType === "numeric" &&
    score.trim() !== "" &&
    !Number.isFinite(Number(score))
      ? detectScoreType(score)
      : declaredType;

  const gpa = hasGpa
    ? Math.round(gpaRaw * 100) / 100
    : deriveGpa(scoreType, score);

  const typeRaw = String(input.type ?? "").trim();
  const type =
    typeRaw === "必修" || typeRaw === "必修课" || typeRaw === "required"
      ? "required"
      : typeRaw === "通识" ||
          typeRaw === "通识选修" ||
          typeRaw === "通识选修课" ||
          typeRaw === "general"
        ? "general"
        : typeRaw === "选修" ||
            typeRaw === "选修课" ||
            typeRaw === "任选" ||
            typeRaw === "限选" ||
            typeRaw === "elective"
          ? "elective"
          : "required";

  return {
    name,
    credit,
    scoreType,
    score,
    gpa,
    semester: normalizeSemester(input.semester) ?? "fall",
    type,
  };
}

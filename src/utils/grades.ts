import type {
  GpaScaleId,
  GradeDraft,
  GradeRecord,
  GradeRetakePolicy,
  GradeRule,
  GradeScoreType,
  GradeType,
  GradeYear,
  Schedule,
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

export interface GpaScaleMeta {
  id: GpaScaleId;
  label: string;
  shortLabel: string;
  maxGpa: number;
  summary: string;
}

export const GPA_SCALES: readonly GpaScaleMeta[] = [
  {
    id: "five",
    label: "5.0 线性制",
    shortLabel: "5.0 制",
    maxGpa: 5.0,
    summary: "60 分起算 1.0，每高 1 分 +0.1（100 分 = 5.0）",
  },
  {
    id: "four_std",
    label: "标准 4.0 制",
    shortLabel: "4.0 分段",
    maxGpa: 4.0,
    summary: "90+=4.0, 85+=3.7, 82+=3.3, 78+=3.0, 75+=2.7, 72+=2.3, 68+=2.0, 64+=1.5, 60+=1.0",
  },
  {
    id: "four_pku",
    label: "北大 4.0 制",
    shortLabel: "北大 4.0",
    maxGpa: 4.0,
    summary: "60 分起算：GPA = 4 − 3×(100 − 分数)² ÷ 1600",
  },
  {
    id: "four_three",
    label: "4.3 分段制",
    shortLabel: "4.3 制",
    maxGpa: 4.3,
    summary: "95+=4.3, 90+=4.0, 85+=3.7, 82+=3.3, 78+=3.0, 75+=2.7, 72+=2.3, 68+=2.0, 64+=1.5, 60+=1.0",
  },
  {
    id: "four_linear",
    label: "4.0 线性制",
    shortLabel: "4.0 线性",
    maxGpa: 4.0,
    summary: "60 分起算 1.0，每高 1 分 +0.1，90 分及以上满绩 4.0",
  },
];

export function isGpaScaleId(value: unknown): value is GpaScaleId {
  return (
    value === "five" ||
    value === "four_std" ||
    value === "four_pku" ||
    value === "four_three" ||
    value === "four_linear"
  );
}

export function getGpaScaleMeta(scale: GpaScaleId = "five"): GpaScaleMeta {
  return GPA_SCALES.find((item) => item.id === scale) ?? GPA_SCALES[0];
}

/** 字母等级 → 各绩点制对应绩点 */
const LETTER_GPA_40: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0,
};

const LETTER_GPA_43: Record<string, number> = {
  ...LETTER_GPA_40,
  "A+": 4.3,
};

const LETTER_GPA_50: Record<string, number> = {
  "A+": 5.0,
  A: 4.5,
  "A-": 4.2,
  "B+": 3.8,
  B: 3.5,
  "B-": 3.2,
  "C+": 2.8,
  C: 2.5,
  "C-": 2.2,
  "D+": 1.8,
  D: 1.5,
  "D-": 1.0,
  F: 0,
};

/** 文字等级 → 各绩点制对应绩点（合格 / 通过类通常不计入绩点） */
const TEXT_GPA_BY_SCALE: Record<GpaScaleId, Record<string, number>> = {
  five: {
    优秀: 4.5,
    良好: 3.5,
    中等: 2.5,
    及格: 1.5,
    不及格: 0,
  },
  four_std: {
    优秀: 4.0,
    良好: 3.3,
    中等: 2.3,
    及格: 1.0,
    不及格: 0,
  },
  four_pku: {
    优秀: 4.0,
    良好: 3.5,
    中等: 2.7,
    及格: 1.5,
    不及格: 0,
  },
  four_three: {
    优秀: 4.0,
    良好: 3.3,
    中等: 2.3,
    及格: 1.0,
    不及格: 0,
  },
  four_linear: {
    优秀: 4.0,
    良好: 3.5,
    中等: 2.5,
    及格: 1.5,
    不及格: 0,
  },
};

const LETTER_GPA_BY_SCALE: Record<GpaScaleId, Record<string, number>> = {
  five: LETTER_GPA_50,
  four_std: LETTER_GPA_40,
  four_pku: LETTER_GPA_40,
  four_three: LETTER_GPA_43,
  four_linear: LETTER_GPA_40,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 百分制分数 → 绩点（按所选绩点制换算，默认 5.0 线性制以兼容存量）
 */
export function numericScoreToGpa(
  score: number,
  scale: GpaScaleId = "five",
): number {
  if (!Number.isFinite(score) || score < 60) return 0;
  const clamped = Math.min(100, Math.max(0, score));
  switch (scale) {
    case "five":
      return Math.round((1 + (clamped - 60) * 0.1) * 10) / 10;
    case "four_linear":
      return Math.min(4.0, Math.round((1 + (clamped - 60) * 0.1) * 10) / 10);
    case "four_pku":
      return round2(4 - (3 * Math.pow(100 - clamped, 2)) / 1600);
    case "four_three":
      if (clamped >= 95) return 4.3;
      if (clamped >= 90) return 4.0;
      if (clamped >= 85) return 3.7;
      if (clamped >= 82) return 3.3;
      if (clamped >= 78) return 3.0;
      if (clamped >= 75) return 2.7;
      if (clamped >= 72) return 2.3;
      if (clamped >= 68) return 2.0;
      if (clamped >= 64) return 1.5;
      return 1.0;
    case "four_std":
      if (clamped >= 90) return 4.0;
      if (clamped >= 85) return 3.7;
      if (clamped >= 82) return 3.3;
      if (clamped >= 78) return 3.0;
      if (clamped >= 75) return 2.7;
      if (clamped >= 72) return 2.3;
      if (clamped >= 68) return 2.0;
      if (clamped >= 64) return 1.5;
      return 1.0;
  }
}

/** 判断原始分数的展示类型 */
export function detectScoreType(raw: string): GradeScoreType {
  const text = raw.trim();
  if (!text) return "numeric";
  const num = Number(text);
  if (text !== "" && Number.isFinite(num)) return "numeric";
  if (LETTER_GPA_40[text.toUpperCase()] != null) return "letter";
  if (
    TEXT_GPA_BY_SCALE.five[text] != null ||
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
  scale: GpaScaleId = "five",
): number | null {
  const text = score.trim();
  if (!text) return null;
  if (scoreType === "numeric") {
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 && n <= 100
      ? numericScoreToGpa(n, scale)
      : null;
  }
  if (scoreType === "letter") {
    return LETTER_GPA_BY_SCALE[scale][text.toUpperCase()] ?? null;
  }
  return TEXT_GPA_BY_SCALE[scale][text] ?? null;
}

/** 绩点保留两位小数用于统计展示 */
export const formatGpa = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

/** 单门课程绩点展示：保留有效小数（1~2 位），不截断如 3.75 / 3.33 */
export const formatCourseGpa = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "--";
  const rounded = round2(value);
  return Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-6
    ? rounded.toFixed(1)
    : rounded.toFixed(2);
};

/** 加权平均分展示 */
export const formatWeightedScore = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

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

/** 判断该条成绩是否通过（用于统计已获总学分，兼容通过/合格制） */
export function isGradePassed(grade: GradeRecord): boolean {
  const text = (grade.score ?? "").trim();
  if (grade.scoreType === "numeric" && text) {
    const n = Number(text);
    if (Number.isFinite(n)) return n >= 60;
  }
  if (grade.scoreType === "letter" && text) {
    return text.toUpperCase() !== "F";
  }
  if (grade.scoreType === "text" && text) {
    if (/不及格|不合格|未通过|缺考|缓考|待出分|待填|未出分/.test(text)) return false;
    return true;
  }
  return grade.gpa != null && grade.gpa > 0;
}

/** 重修计分策略元信息 */
export interface RetakePolicyMeta {
  id: GradeRetakePolicy;
  label: string;
  shortLabel: string;
  description: string;
}

export const GRADE_RETAKE_POLICIES: readonly RetakePolicyMeta[] = [
  {
    id: "all",
    label: "全部计入",
    shortLabel: "全部计入",
    description: "重复修读的同名课程每次成绩均参与绩点与均分统计",
  },
  {
    id: "highest",
    label: "重修取最高",
    shortLabel: "重修取最高",
    description: "同名课程仅计入绩点最高的一次（同绩点取更高分/较新记录）",
  },
  {
    id: "latest",
    label: "重修取最新",
    shortLabel: "重修取最新",
    description: "同名课程仅计入最近修读的一次成绩，旧记录标记为已覆盖",
  },
];

export function resolveRetakePolicy(value: unknown): GradeRetakePolicy {
  return value === "highest" || value === "latest" ? value : "all";
}

export function getRetakePolicyMeta(
  policy: GradeRetakePolicy = "all",
): RetakePolicyMeta {
  return (
    GRADE_RETAKE_POLICIES.find((item) => item.id === policy) ??
    GRADE_RETAKE_POLICIES[0]
  );
}

const SEMESTER_CHRONOLOGY_RANK: Record<SemesterKind, number> = {
  fall: 0,
  spring: 1,
  summer: 2,
};

function parseStructuredYearOrder(yearId: string): number | null {
  const trimmed = String(yearId ?? "").trim();
  const yMatch = /^(?:y|year[-_]?)(\d+)$/i.exec(trimmed);
  if (yMatch) return Number(yMatch[1]);
  const calMatch = /^(\d{4})(?:[-_/]\d{2,4})?$/.exec(trimmed);
  if (calMatch) return Number(calMatch[1]);
  return null;
}

function parseValidNumericScore(grade: GradeRecord): number | null {
  if (grade.scoreType !== "numeric") return null;
  const text = (grade.score ?? "").trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) && num >= 0 && num <= 100 ? num : null;
}

function compareGradeRecency(
  a: { grade: GradeRecord; index: number },
  b: { grade: GradeRecord; index: number },
  yearOrderMap: ReadonlyMap<string, number> | null,
): number {
  if (a.grade.yearId !== b.grade.yearId) {
    if (yearOrderMap) {
      const ya = yearOrderMap.get(a.grade.yearId);
      const yb = yearOrderMap.get(b.grade.yearId);
      if (ya !== undefined && yb !== undefined && ya !== yb) {
        return ya - yb;
      }
    } else {
      const na = parseStructuredYearOrder(a.grade.yearId);
      const nb = parseStructuredYearOrder(b.grade.yearId);
      if (na !== null && nb !== null && na !== nb) {
        return na - nb;
      }
    }
    return a.index - b.index;
  }
  const sa = SEMESTER_CHRONOLOGY_RANK[a.grade.semester] ?? 0;
  const sb = SEMESTER_CHRONOLOGY_RANK[b.grade.semester] ?? 0;
  if (sa !== sb) return sa - sb;
  return a.index - b.index;
}

function compareGradeHighest(
  a: { grade: GradeRecord; index: number },
  b: { grade: GradeRecord; index: number },
  yearOrderMap: ReadonlyMap<string, number> | null,
): number {
  const gpaA =
    a.grade.gpa != null && Number.isFinite(a.grade.gpa) ? a.grade.gpa : null;
  const gpaB =
    b.grade.gpa != null && Number.isFinite(b.grade.gpa) ? b.grade.gpa : null;

  if (gpaA !== null && gpaB !== null) {
    if (Math.abs(gpaA - gpaB) > 1e-9) return gpaA - gpaB;
  } else if (gpaA !== null || gpaB !== null) {
    const passedA = isGradePassed(a.grade);
    const passedB = isGradePassed(b.grade);
    if (passedA !== passedB) return passedA ? 1 : -1;
    return gpaA !== null ? 1 : -1;
  } else {
    const passedA = isGradePassed(a.grade);
    const passedB = isGradePassed(b.grade);
    if (passedA !== passedB) return passedA ? 1 : -1;
  }

  const numA = parseValidNumericScore(a.grade);
  const numB = parseValidNumericScore(b.grade);
  if (numA !== null && numB !== null) {
    if (Math.abs(numA - numB) > 1e-9) return numA - numB;
  } else if (numA !== null || numB !== null) {
    return numA !== null ? 1 : -1;
  }

  return compareGradeRecency(a, b, yearOrderMap);
}

function buildYearOrderMap(
  gradeYears?: readonly GradeYear[],
): Map<string, number> | null {
  if (!gradeYears?.length) return null;
  const map = new Map<string, number>();
  gradeYears.forEach((y, idx) => {
    map.set(y.id, idx);
  });
  return map;
}

export interface EffectiveGradesResult {
  /** 实际参与计算的成绩记录（已应用规则排除与重修覆盖策略） */
  included: GradeRecord[];
  /** 在规则范围内但因重修策略被覆盖的成绩 id 集合 */
  overriddenIds: Set<string>;
}

/**
 * 结合当前计算规则（类型/单科排除 + 重修覆盖策略）解析真正参与计算的成绩集合
 */
export function resolveEffectiveGrades(
  rule: GradeRule | undefined,
  grades: readonly GradeRecord[],
  gradeYears?: readonly GradeYear[],
): EffectiveGradesResult {
  const baseIncluded = grades.filter((g) => isGradeIncluded(rule, g));
  const policy = resolveRetakePolicy(rule?.retakePolicy);
  const overriddenIds = new Set<string>();

  if (policy === "all" || baseIncluded.length <= 1) {
    return { included: baseIncluded, overriddenIds };
  }

  const yearOrderMap = buildYearOrderMap(gradeYears);
  const groups = new Map<string, { grade: GradeRecord; index: number }[]>();

  baseIncluded.forEach((grade, index) => {
    const rawName = String(grade.name ?? "");
    // 试算模块里未命名的占位课程各自独立，不应互相覆盖
    if (grade.id.startsWith("projection-") && rawName.trim() === "试算课程") {
      return;
    }
    const norm = normalizeGradeCourseName(rawName);
    if (!norm) return;
    const list = groups.get(norm);
    if (list) list.push({ grade, index });
    else groups.set(norm, [{ grade, index }]);
  });

  const overriddenIndices = new Set<number>();
  for (const entries of groups.values()) {
    if (entries.length <= 1) continue;
    let winner = entries[0];
    for (let i = 1; i < entries.length; i++) {
      const candidate = entries[i];
      const cmp =
        policy === "highest"
          ? compareGradeHighest(candidate, winner, yearOrderMap)
          : compareGradeRecency(candidate, winner, yearOrderMap);
      if (cmp > 0) winner = candidate;
    }
    for (const entry of entries) {
      if (entry.index !== winner.index) {
        overriddenIndices.add(entry.index);
        overriddenIds.add(entry.grade.id);
      }
    }
  }

  if (!overriddenIndices.size) {
    return { included: baseIncluded, overriddenIds };
  }

  return {
    included: baseIncluded.filter((_, idx) => !overriddenIndices.has(idx)),
    overriddenIds,
  };
}

export interface GradeStats {
  /** 学分加权平均绩点 */
  value: number | null;
  /** 百分制学分加权平均分（仅统计有效百分制数字成绩） */
  weightedScore: number | null;
  /** 参与加权平均分计算的课程数 */
  weightedScoreCount: number;
  /** 计入绩点计算的学分总数 */
  credits: number;
  /** 已获总学分（含通过/合格等无绩点但已通过且有学分的课程） */
  earnedCredits: number;
  /** 计入的课程数 */
  count: number;
  /** 当前范围内全部课程数 */
  total: number;
  /** 缺少绩点、无法计入的课程数 */
  missing: number;
  /** 缺少学分、暂未计入加权计算的课程数 */
  missingCredit: number;
  /** 因重修覆盖策略未计入的重复修读课程条数 */
  overriddenCount: number;
}

/** 学分加权平均绩点：Σ(绩点 × 学分) / Σ学分，同时计算加权平均分与已获总学分 */
export function calcGradeStats(
  rule: GradeRule | undefined,
  grades: GradeRecord[],
  gradeYears?: readonly GradeYear[],
): GradeStats {
  const { included, overriddenIds } = resolveEffectiveGrades(
    rule,
    grades,
    gradeYears,
  );
  let weighted = 0;
  let credits = 0;
  let count = 0;
  let missing = 0;
  let missingCredit = 0;
  let weightedScoreSum = 0;
  let weightedScoreCredits = 0;
  let weightedScoreCount = 0;
  let earnedCredits = 0;

  for (const grade of included) {
    const credit = Number(grade.credit);
    const hasCredit =
      grade.credit != null && Number.isFinite(credit) && credit > 0;

    if (hasCredit && isGradePassed(grade)) {
      earnedCredits += credit;
    }

    const scoreText = (grade.score ?? "").trim();
    if (hasCredit && grade.scoreType === "numeric" && scoreText) {
      const numeric = Number(scoreText);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
        weightedScoreSum += numeric * credit;
        weightedScoreCredits += credit;
        weightedScoreCount += 1;
      }
    }

    if (grade.gpa == null || !Number.isFinite(grade.gpa)) {
      missing += 1;
      continue;
    }
    if (!hasCredit) {
      missingCredit += 1;
      continue;
    }
    weighted += grade.gpa * credit;
    credits += credit;
    count += 1;
  }

  return {
    value: credits > 0 ? weighted / credits : null,
    weightedScore:
      weightedScoreCredits > 0 ? weightedScoreSum / weightedScoreCredits : null,
    weightedScoreCount,
    credits: round2(credits),
    earnedCredits: round2(earnedCredits),
    count,
    total: grades.length,
    missing,
    missingCredit,
    overriddenCount: overriddenIds.size,
  };
}

/** 归一化名称用于导入去重对比 */
export function normalizeGradeCourseName(name: string): string {
  return name.replace(/[\s"'“”‘’()（）]/g, "").toLowerCase();
}

/** 成绩入库去重键：同学年 + 同学期 + 归一化同名 */
export function gradeDuplicateKey(
  yearId: string,
  semester: SemesterKind,
  name: string,
): string {
  return `${yearId}|${semester}|${normalizeGradeCourseName(name)}`;
}

/** 把识别或输入的课程类型匹配到用户现有的课程类型 id（兼容自定义类型） */
export function resolveGradeTypeId(
  rawType: unknown,
  customTypes?: readonly GradeType[],
): string {
  const typeRaw = String(rawType ?? "").trim();
  const list = customTypes?.length ? customTypes : undefined;
  const fallback = list?.[0]?.id ?? "required";

  if (typeRaw && list) {
    const exactId = list.find((t) => t.id === typeRaw);
    if (exactId) return exactId.id;
    const exactName = list.find((t) => t.name.trim() === typeRaw);
    if (exactName) return exactName.id;
    const fuzzy = list.find(
      (t) =>
        typeRaw.includes(t.name.trim()) ||
        (t.name.trim().length >= 2 && t.name.trim().includes(typeRaw)),
    );
    if (fuzzy) return fuzzy.id;
  }

  const builtin =
    typeRaw === "必修" ||
    typeRaw === "必修课" ||
    typeRaw === "required" ||
    /必修|学位/.test(typeRaw)
      ? "required"
      : typeRaw === "通识" ||
          typeRaw === "通识选修" ||
          typeRaw === "通识选修课" ||
          typeRaw === "general" ||
          /通识|公选|通选/.test(typeRaw)
        ? "general"
        : typeRaw === "选修" ||
            typeRaw === "选修课" ||
            typeRaw === "任选" ||
            typeRaw === "限选" ||
            typeRaw === "elective" ||
            /选修|任选|限选/.test(typeRaw)
          ? "elective"
          : fallback;

  if (!list) return builtin;
  return list.some((t) => t.id === builtin) ? builtin : fallback;
}

/** 规范化一条识别/迁移来的成绩（补全类型、绩点与学期；学年由入库方补上） */
export function normalizeGradeInput(
  input: {
    name?: unknown;
    credit?: unknown;
    score?: unknown;
    grade?: unknown;
    scoreType?: unknown;
    gpa?: unknown;
    type?: unknown;
    semester?: unknown;
  },
  opts?: {
    scale?: GpaScaleId;
    types?: readonly GradeType[];
  },
): GradeDraft | null {
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
    input.gpa != null &&
    String(input.gpa).trim() !== "" &&
    Number.isFinite(gpaRaw) &&
    gpaRaw >= 0 &&
    gpaRaw <= 5;
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

  const scale = opts?.scale ?? "five";
  const gpa = hasGpa ? round2(gpaRaw) : deriveGpa(scoreType, score, scale);

  return {
    name,
    credit,
    scoreType,
    score,
    gpa,
    semester: normalizeSemester(input.semester) ?? "fall",
    type: resolveGradeTypeId(input.type, opts?.types),
  };
}

/** 单个学期的 GPA 趋势数据点 */
export interface TermGpaPoint {
  key: string;
  label: string;
  yearId: string;
  yearName: string;
  semester: SemesterKind;
  gpa: number;
  weightedScore: number | null;
  credits: number;
  courseCount: number;
}

const SHORT_SEMESTER_LABEL: Record<SemesterKind, string> = {
  fall: "上",
  spring: "下",
  summer: "短",
};

/**
 * 按学年顺序 × 上/下/短学期聚合各学期 GPA 与加权均分，跳过无有效计入成绩的空学期
 */
export function buildTermGpaTrend(
  grades: readonly GradeRecord[],
  gradeYears: readonly GradeYear[],
  rule?: GradeRule,
): TermGpaPoint[] {
  const byTerm = new Map<string, GradeRecord[]>();
  for (const grade of grades) {
    if (!isGradeIncluded(rule, grade)) continue;
    const key = `${grade.yearId}:${grade.semester}`;
    const list = byTerm.get(key);
    if (list) list.push(grade);
    else byTerm.set(key, [grade]);
  }

  const points: TermGpaPoint[] = [];
  for (const year of gradeYears) {
    for (const sem of GRADE_SEMESTERS) {
      const key = `${year.id}:${sem.kind}`;
      const termGrades = byTerm.get(key);
      if (!termGrades?.length) continue;
      const stats = calcGradeStats(rule, termGrades);
      if (stats.value === null || stats.credits <= 0) continue;
      points.push({
        key,
        label: `${year.name}·${SHORT_SEMESTER_LABEL[sem.kind]}`,
        yearId: year.id,
        yearName: year.name,
        semester: sem.kind,
        gpa: stats.value,
        weightedScore: stats.weightedScore,
        credits: stats.credits,
        courseCount: stats.count,
      });
    }
  }

  return points;
}

/** 单个课程类型的学分分布统计 */
export interface CreditBucket {
  typeId: string;
  typeName: string;
  earnedCredits: number;
  totalCredits: number;
  courseCount: number;
  /** 占已获总学分的比例（0 ~ 1） */
  share: number;
}

/** 全部课程类型的学分结构汇总 */
export interface CreditDistribution {
  buckets: CreditBucket[];
  totalEarnedCredits: number;
  totalCredits: number;
  passedCount: number;
  courseCount: number;
}

/**
 * 按课程类型统计已获学分（经由 isGradePassed 判定，兼容合格/通过制）与学分占比
 */
export function buildCreditDistribution(
  grades: readonly GradeRecord[],
  gradeTypes: readonly GradeType[],
  rule?: GradeRule,
): CreditDistribution {
  const accMap = new Map<
    string,
    {
      typeId: string;
      typeName: string;
      earnedRaw: number;
      totalRaw: number;
      courseCount: number;
    }
  >();

  for (const t of gradeTypes) {
    accMap.set(t.id, {
      typeId: t.id,
      typeName: t.name,
      earnedRaw: 0,
      totalRaw: 0,
      courseCount: 0,
    });
  }

  let totalEarnedRaw = 0;
  let totalAttemptedRaw = 0;
  let passedCount = 0;
  let courseCount = 0;

  for (const grade of grades) {
    if (!isGradeIncluded(rule, grade)) continue;
    courseCount += 1;

    let bucket = accMap.get(grade.type);
    if (!bucket) {
      bucket = {
        typeId: grade.type,
        typeName: "其他类型",
        earnedRaw: 0,
        totalRaw: 0,
        courseCount: 0,
      };
      accMap.set(grade.type, bucket);
    }
    bucket.courseCount += 1;

    const credit = Number(grade.credit);
    const hasCredit =
      grade.credit != null && Number.isFinite(credit) && credit > 0;
    const passed = isGradePassed(grade);
    if (passed) passedCount += 1;

    if (hasCredit) {
      bucket.totalRaw += credit;
      totalAttemptedRaw += credit;
      if (passed) {
        bucket.earnedRaw += credit;
        totalEarnedRaw += credit;
      }
    }
  }

  const buckets: CreditBucket[] = [...accMap.values()].map((item) => ({
    typeId: item.typeId,
    typeName: item.typeName,
    earnedCredits: round2(item.earnedRaw),
    totalCredits: round2(item.totalRaw),
    courseCount: item.courseCount,
    share: totalEarnedRaw > 0 ? item.earnedRaw / totalEarnedRaw : 0,
  }));

  return {
    buckets,
    totalEarnedCredits: round2(totalEarnedRaw),
    totalCredits: round2(totalAttemptedRaw),
    passedCount,
    courseCount,
  };
}

/** 从当前课表提取的结课导入候选课程 */
export interface ScheduleGradeCandidate {
  name: string;
  credit: number | null;
  alreadyExists: boolean;
  defaultTypeId: string;
}

/**
 * 从课表提取去重后的结课导入候选列表：
 * - 按归一化课程名合并多时段条目，保留最高有效学分
 * - 按 gradeDuplicateKey(yearId, semester, name) 标记是否已存在成绩记录
 */
export function buildScheduleGradeCandidates(
  schedule: Pick<Schedule, "courses"> | null | undefined,
  existingGrades: readonly GradeRecord[],
  yearId: string,
  semester: SemesterKind,
  defaultTypeId: string = "required",
): ScheduleGradeCandidate[] {
  const courses = schedule?.courses;
  if (!courses?.length) return [];

  const existingKeys = new Set(
    existingGrades.map((g) => gradeDuplicateKey(g.yearId, g.semester, g.name)),
  );

  const byNorm = new Map<string, ScheduleGradeCandidate>();
  for (const course of courses) {
    const name = (course.name ?? "").trim();
    const norm = normalizeGradeCourseName(name);
    if (!name || !norm) continue;

    const rawCredit = Number(course.credits);
    const validCredit =
      course.credits != null && Number.isFinite(rawCredit) && rawCredit > 0
        ? round2(rawCredit)
        : null;

    const existing = byNorm.get(norm);
    if (existing) {
      if (
        validCredit !== null &&
        (existing.credit === null || validCredit > existing.credit)
      ) {
        existing.credit = validCredit;
      }
      continue;
    }

    byNorm.set(norm, {
      name,
      credit: validCredit,
      alreadyExists: existingKeys.has(
        gradeDuplicateKey(yearId, semester, name),
      ),
      defaultTypeId,
    });
  }

  return [...byNorm.values()];
}

/** 毕业总学分目标的保留覆写键（未设置时自动按各课程类型目标之和计算） */
export const GRADUATION_TOTAL_TARGET_KEY = "_total";

/** 单个课程类型的毕业学分进度 */
export interface GraduationCategoryProgress {
  typeId: string;
  typeName: string;
  earnedCredits: number;
  targetCredits: number;
  /** 达成比例（0 ~ 1，无目标时为 0） */
  ratio: number;
  /** 距离目标还差多少学分（>= 0，无目标时为 0） */
  remainingCredits: number;
  /** 已通过计入毕业学分的去重课程数 */
  passedCourseCount: number;
}

/** 毕业学分整体与分类进度汇总 */
export interface GraduationProgress {
  categories: GraduationCategoryProgress[];
  totalEarnedCredits: number;
  totalTargetCredits: number;
  /** 整体达成比例（0 ~ 1，无目标时为 0） */
  overallRatio: number;
  /** 距离总目标还差多少学分（>= 0，无目标时为 0） */
  overallRemainingCredits: number;
  /** 已通过计入毕业学分的去重课程总数 */
  passedCourseCount: number;
  /** 因重修已通过而被去重、避免重复计入毕业学分的记录数 */
  dedupedRetakeCount: number;
  /** 是否至少配置了任一有效目标学分 */
  hasTargets: boolean;
}

/**
 * 按常见培养方案比例，为当前课程类型生成总计等于 totalCredits 的预设毕业学分目标
 */
export function buildGraduationPresetTargets(
  totalCredits: number,
  gradeTypes: readonly GradeType[],
): Record<string, number> {
  const total = Math.round(totalCredits);
  if (!Number.isFinite(total) || total <= 0 || gradeTypes.length === 0) {
    return {};
  }
  if (gradeTypes.length === 1) {
    return { [gradeTypes[0].id]: total };
  }
  const weightOf = (t: GradeType): number => {
    if (t.id === "required" || /必修|学位|核心/.test(t.name)) return 62.5;
    if (t.id === "general" || /通识|公选|通选/.test(t.name)) return 12.5;
    if (t.id === "elective" || /选修|限选|任选/.test(t.name)) return 25;
    return 12.5;
  };
  const weights = gradeTypes.map((t) => weightOf(t));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);
  const out: Record<string, number> = {};
  let allocated = 0;

  for (let i = 0; i < gradeTypes.length; i++) {
    if (i === gradeTypes.length - 1) {
      out[gradeTypes[i].id] = Math.max(0, total - allocated);
    } else {
      const share = Math.round((total * weights[i]) / weightSum);
      out[gradeTypes[i].id] = share;
      allocated += share;
    }
  }

  const actualSum = Object.values(out).reduce((acc, n) => acc + n, 0);
  if (actualSum !== total) {
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIdx]) maxIdx = i;
    }
    const key = gradeTypes[maxIdx].id;
    out[key] = Math.max(0, (out[key] ?? 0) + (total - actualSum));
  }

  return out;
}

/**
 * 计算毕业学分整体与各课程类型进度：
 * - 自动对已通过的同名重修课程按归一化名称去重，避免重修刷分虚增毕业学分
 * - 兼容合格/通过制无绩点课程
 */
export function computeGraduationProgress(
  grades: readonly GradeRecord[],
  gradeTypes: readonly GradeType[],
  targets: Record<string, number> | null | undefined,
  rule?: GradeRule,
  gradeYears?: readonly GradeYear[],
): GraduationProgress {
  const safeTargets = targets && typeof targets === "object" ? targets : {};
  const policy = resolveRetakePolicy(rule?.retakePolicy);
  const yearOrderMap = buildYearOrderMap(gradeYears);

  const passedEntries: { grade: GradeRecord; index: number }[] = [];
  grades.forEach((grade, index) => {
    if (!isGradeIncluded(rule, grade)) return;
    if (!isGradePassed(grade)) return;
    passedEntries.push({ grade, index });
  });

  const groups = new Map<string, { grade: GradeRecord; index: number }[]>();
  const uniquePassed: { grade: GradeRecord; credit: number | null }[] = [];
  let dedupedRetakeCount = 0;

  for (const entry of passedEntries) {
    const norm = normalizeGradeCourseName(String(entry.grade.name ?? ""));
    if (!norm) {
      const c = Number(entry.grade.credit);
      uniquePassed.push({
        grade: entry.grade,
        credit:
          entry.grade.credit != null && Number.isFinite(c) && c > 0 ? c : null,
      });
      continue;
    }
    const list = groups.get(norm);
    if (list) list.push(entry);
    else groups.set(norm, [entry]);
  }

  for (const entries of groups.values()) {
    let winner = entries[0];
    for (let i = 1; i < entries.length; i++) {
      const candidate = entries[i];
      const cmp =
        policy === "latest"
          ? compareGradeRecency(candidate, winner, yearOrderMap)
          : compareGradeHighest(candidate, winner, yearOrderMap);
      if (cmp > 0) winner = candidate;
    }
    if (entries.length > 1) {
      dedupedRetakeCount += entries.length - 1;
    }

    const winnerCreditRaw = Number(winner.grade.credit);
    let effectiveCredit =
      winner.grade.credit != null &&
      Number.isFinite(winnerCreditRaw) &&
      winnerCreditRaw > 0
        ? winnerCreditRaw
        : null;
    if (effectiveCredit === null) {
      for (const item of entries) {
        const c = Number(item.grade.credit);
        if (item.grade.credit != null && Number.isFinite(c) && c > 0) {
          if (effectiveCredit === null || c > effectiveCredit) {
            effectiveCredit = c;
          }
        }
      }
    }
    uniquePassed.push({ grade: winner.grade, credit: effectiveCredit });
  }

  const accMap = new Map<
    string,
    {
      typeId: string;
      typeName: string;
      earnedRaw: number;
      passedCourseCount: number;
    }
  >();

  for (const t of gradeTypes) {
    accMap.set(t.id, {
      typeId: t.id,
      typeName: t.name,
      earnedRaw: 0,
      passedCourseCount: 0,
    });
  }

  let totalEarnedRaw = 0;
  for (const item of uniquePassed) {
    let bucket = accMap.get(item.grade.type);
    if (!bucket) {
      bucket = {
        typeId: item.grade.type,
        typeName: "其他类型",
        earnedRaw: 0,
        passedCourseCount: 0,
      };
      accMap.set(item.grade.type, bucket);
    }
    bucket.passedCourseCount += 1;
    if (item.credit != null && item.credit > 0) {
      bucket.earnedRaw += item.credit;
      totalEarnedRaw += item.credit;
    }
  }

  const readTarget = (key: string): number => {
    const raw = Number(safeTargets[key]);
    return Number.isFinite(raw) && raw > 0 ? round2(raw) : 0;
  };

  let sumCategoryTargets = 0;
  const categories: GraduationCategoryProgress[] = [...accMap.values()].map(
    (item) => {
      const earnedCredits = round2(item.earnedRaw);
      const targetCredits = readTarget(item.typeId);
      sumCategoryTargets += targetCredits;
      const ratio =
        targetCredits > 0 ? Math.min(1, earnedCredits / targetCredits) : 0;
      const remainingCredits =
        targetCredits > 0
          ? round2(Math.max(0, targetCredits - earnedCredits))
          : 0;
      return {
        typeId: item.typeId,
        typeName: item.typeName,
        earnedCredits,
        targetCredits,
        ratio,
        remainingCredits,
        passedCourseCount: item.passedCourseCount,
      };
    },
  );

  const explicitTotalTarget = readTarget(GRADUATION_TOTAL_TARGET_KEY);
  const totalTargetCredits =
    explicitTotalTarget > 0 ? explicitTotalTarget : round2(sumCategoryTargets);
  const totalEarnedCredits = round2(totalEarnedRaw);
  const overallRatio =
    totalTargetCredits > 0
      ? Math.min(1, totalEarnedCredits / totalTargetCredits)
      : 0;
  const overallRemainingCredits =
    totalTargetCredits > 0
      ? round2(Math.max(0, totalTargetCredits - totalEarnedCredits))
      : 0;
  const hasTargets =
    totalTargetCredits > 0 || categories.some((c) => c.targetCredits > 0);

  return {
    categories,
    totalEarnedCredits,
    totalTargetCredits,
    overallRatio,
    overallRemainingCredits,
    passedCourseCount: uniquePassed.length,
    dedupedRetakeCount,
    hasTargets,
  };
}

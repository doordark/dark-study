const assert = require("node:assert/strict");

const disk = new Map();
const storage = {
  getItem: async (k) => disk.get(k) ?? null,
  setItem: async (k, v) => {
    disk.set(k, v);
  },
  removeItem: async (k) => {
    disk.delete(k);
  },
  multiGet: async (keys) => keys.map((k) => [k, disk.get(k) ?? null]),
  multiSet: async (rows) => rows.forEach(([k, v]) => disk.set(k, v)),
  multiRemove: async (keys) => keys.forEach((k) => disk.delete(k)),
};

const load = require("./load-project-ts.cjs")({
  "@react-native-async-storage/async-storage": storage,
  "react-native": { Platform: { OS: "android" } },
});

const gradesUtil = load("src/utils/grades.ts");
const { useStore } = load("src/store/useStore.ts");

const years = [
  { id: "y1", name: "大一" },
  { id: "y2", name: "大二" },
  { id: "y3", name: "大三" },
];

const types = [
  { id: "required", name: "必修课" },
  { id: "elective", name: "选修课" },
  { id: "general", name: "通识选修课" },
  { id: "type-pe", name: "体育课" },
];

// 1. buildTermGpaTrend: chronological ordering, empty/excluded terms skipped, exact GPA & weightedScore
const scrambledGrades = [
  // y2 spring (should appear 3rd)
  {
    id: "g-y2s-1",
    name: "操作系统",
    credit: 4,
    scoreType: "numeric",
    score: "95",
    gpa: 4.5,
    yearId: "y2",
    semester: "spring",
    type: "required",
  },
  // y1 fall (should appear 1st): (4.0*4 + 3.0*2) / 6 = 22/6 = 3.6667; weighted = (90*4 + 80*2)/6 = 86.6667
  {
    id: "g-y1f-1",
    name: "高等数学",
    credit: 4,
    scoreType: "numeric",
    score: "90",
    gpa: 4.0,
    yearId: "y1",
    semester: "fall",
    type: "required",
  },
  {
    id: "g-y1f-2",
    name: "线性代数",
    credit: 2,
    scoreType: "numeric",
    score: "80",
    gpa: 3.0,
    yearId: "y1",
    semester: "fall",
    type: "required",
  },
  // y1 fall excluded general course (should be excluded by rule)
  {
    id: "g-y1f-3",
    name: "电影赏析",
    credit: 2,
    scoreType: "numeric",
    score: "60",
    gpa: 1.0,
    yearId: "y1",
    semester: "fall",
    type: "general",
  },
  // y1 summer only has a pass/fail (gpa: null) -> no GPA point, must be skipped in trend
  {
    id: "g-y1u-1",
    name: "社会实践",
    credit: 2,
    scoreType: "text",
    score: "合格",
    gpa: null,
    yearId: "y1",
    semester: "summer",
    type: "general",
  },
  // y1 spring only has a course excluded by type -> must be skipped when rule excludes general
  {
    id: "g-y1s-1",
    name: "艺术导论",
    credit: 2,
    scoreType: "numeric",
    score: "88",
    gpa: 3.8,
    yearId: "y1",
    semester: "spring",
    type: "general",
  },
  // y2 fall (should appear 2nd): failed numeric course still has valid gpa=0, credit=3
  {
    id: "g-y2f-1",
    name: "概率论",
    credit: 3,
    scoreType: "numeric",
    score: "45",
    gpa: 0,
    yearId: "y2",
    semester: "fall",
    type: "required",
  },
  // y2 fall manually excluded course
  {
    id: "g-y2f-2",
    name: "离散数学",
    credit: 3,
    scoreType: "numeric",
    score: "90",
    gpa: 4.0,
    yearId: "y2",
    semester: "fall",
    type: "required",
  },
  // y3 fall only has pending blank-score draft -> no GPA, must be skipped
  {
    id: "g-y3f-1",
    name: "编译原理",
    credit: 3,
    scoreType: "numeric",
    score: "",
    gpa: null,
    yearId: "y3",
    semester: "fall",
    type: "required",
  },
];

const rule = {
  id: "r1",
  name: "核心规则",
  excludedTypes: ["general"],
  excludedCourseIds: ["g-y2f-2"],
};

const trend = gradesUtil.buildTermGpaTrend(scrambledGrades, years, rule);
assert.deepEqual(
  trend.map((p) => p.key),
  ["y1:fall", "y2:fall", "y2:spring"],
  "trend must order by gradeYears × fall->spring->summer and omit empty/excluded/null-GPA terms",
);
assert.equal(trend[0].label, "大一·上");
assert.equal(trend[0].yearName, "大一");
assert.equal(trend[0].semester, "fall");
assert.equal(trend[0].credits, 6);
assert.equal(trend[0].courseCount, 2);
assert.ok(Math.abs(trend[0].gpa - 22 / 6) < 1e-9);
assert.ok(Math.abs(trend[0].weightedScore - 520 / 6) < 1e-9);

assert.equal(trend[1].key, "y2:fall");
assert.equal(trend[1].gpa, 0);
assert.equal(trend[1].weightedScore, 45);
assert.equal(trend[1].credits, 3);
assert.equal(trend[1].courseCount, 1);

assert.equal(trend[2].key, "y2:spring");
assert.equal(trend[2].gpa, 4.5);
assert.equal(trend[2].weightedScore, 95);
assert.equal(trend[2].credits, 4);

// Without rule, y1:spring is included too and y1:fall includes general course
const trendAll = gradesUtil.buildTermGpaTrend(scrambledGrades, years);
assert.deepEqual(
  trendAll.map((p) => p.key),
  ["y1:fall", "y1:spring", "y2:fall", "y2:spring"],
);

// 2. buildCreditDistribution: passed vs failed, pass/fail non-GPA earned credits, share sum = 1
const creditSample = [
  {
    id: "c1",
    name: "高数",
    credit: 4,
    scoreType: "numeric",
    score: "92",
    gpa: 4.2,
    yearId: "y1",
    semester: "fall",
    type: "required",
  },
  {
    id: "c2",
    name: "挂科必修",
    credit: 3,
    scoreType: "numeric",
    score: "52",
    gpa: 0,
    yearId: "y1",
    semester: "fall",
    type: "required",
  },
  {
    id: "c3",
    name: "专业选修",
    credit: 2,
    scoreType: "letter",
    score: "B+",
    gpa: 3.8,
    yearId: "y1",
    semester: "spring",
    type: "elective",
  },
  {
    id: "c4",
    name: "挂科字母课",
    credit: 2,
    scoreType: "letter",
    score: "F",
    gpa: 0,
    yearId: "y1",
    semester: "spring",
    type: "elective",
  },
  {
    id: "c5",
    name: "劳动教育",
    credit: 2,
    scoreType: "text",
    score: "合格",
    gpa: null,
    yearId: "y1",
    semester: "summer",
    type: "general",
  },
  {
    id: "c6",
    name: "未出分课",
    credit: 2,
    scoreType: "numeric",
    score: "",
    gpa: null,
    yearId: "y2",
    semester: "fall",
    type: "general",
  },
  {
    id: "c7",
    name: "待出分文字课",
    credit: 1,
    scoreType: "text",
    score: "待出分",
    gpa: null,
    yearId: "y2",
    semester: "fall",
    type: "general",
  },
  {
    id: "c8",
    name: "篮球",
    credit: 2,
    scoreType: "text",
    score: "通过",
    gpa: null,
    yearId: "y1",
    semester: "fall",
    type: "type-pe",
  },
];

const dist = gradesUtil.buildCreditDistribution(creditSample, types);
// Earned: 4 (required) + 2 (elective) + 2 (general pass/fail) + 2 (pe pass/fail) = 10
assert.equal(dist.totalEarnedCredits, 10);
// Attempted total credits: 4+3 + 2+2 + 2+2+1 + 2 = 18
assert.equal(dist.totalCredits, 18);

const byId = Object.fromEntries(dist.buckets.map((b) => [b.typeId, b]));
assert.equal(byId.required.earnedCredits, 4);
assert.equal(byId.required.totalCredits, 7);
assert.equal(byId.required.courseCount, 2);
assert.ok(Math.abs(byId.required.share - 0.4) < 1e-9);

assert.equal(byId.elective.earnedCredits, 2);
assert.equal(byId.elective.totalCredits, 4);
assert.ok(Math.abs(byId.elective.share - 0.2) < 1e-9);

assert.equal(byId.general.earnedCredits, 2);
assert.equal(byId.general.totalCredits, 5);
assert.ok(Math.abs(byId.general.share - 0.2) < 1e-9);

assert.equal(byId["type-pe"].earnedCredits, 2);
assert.equal(byId["type-pe"].totalCredits, 2);
assert.ok(Math.abs(byId["type-pe"].share - 0.2) < 1e-9);

const shareSum = dist.buckets.reduce((acc, b) => acc + b.share, 0);
assert.ok(Math.abs(shareSum - 1) < 1e-9, `expected share sum 1, got ${shareSum}`);

// With rule excluding general: earned = 8 (4 required + 2 elective + 2 pe)
const distWithRule = gradesUtil.buildCreditDistribution(creditSample, types, rule);
assert.equal(distWithRule.totalEarnedCredits, 8);
const shareSumRule = distWithRule.buckets.reduce((acc, b) => acc + b.share, 0);
assert.ok(Math.abs(shareSumRule - 1) < 1e-9);

// Empty grades -> totalEarnedCredits = 0 and all shares = 0
const emptyDist = gradesUtil.buildCreditDistribution([], types);
assert.equal(emptyDist.totalEarnedCredits, 0);
assert.ok(emptyDist.buckets.every((b) => b.share === 0));

// 3. buildScheduleGradeCandidates: multi-slot dedupe, highest valid credit, alreadyExists check
const schedule = {
  courses: [
    {
      id: "s1",
      name: "数据结构（A）",
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 2, 3],
      credits: undefined,
    },
    {
      id: "s2",
      name: "数据结构(A) ",
      weekday: 3,
      startPeriod: 3,
      endPeriod: 4,
      weeks: [1, 2, 3],
      credits: 2.5,
    },
    {
      id: "s3",
      name: "数据结构（A）",
      weekday: 5,
      startPeriod: 5,
      endPeriod: 6,
      weeks: [4, 5, 6],
      credits: 4,
    },
    {
      id: "s4",
      name: "计算机网络",
      weekday: 2,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 2],
      credits: 3,
    },
    {
      id: "s5",
      name: "形势与政策",
      weekday: 4,
      startPeriod: 7,
      endPeriod: 8,
      weeks: [1],
      credits: 0,
    },
    {
      id: "s6",
      name: "   ",
      weekday: 4,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1],
      credits: 2,
    },
  ],
};

const existingGrades = [
  {
    id: "e1",
    name: "数据结构(A)",
    credit: 4,
    scoreType: "numeric",
    score: "91",
    gpa: 4.1,
    yearId: "y2",
    semester: "fall",
    type: "required",
  },
  // Same course name in a DIFFERENT semester must NOT mark y2:fall as alreadyExists
  {
    id: "e2",
    name: "计算机网络",
    credit: 3,
    scoreType: "numeric",
    score: "88",
    gpa: 3.8,
    yearId: "y2",
    semester: "spring",
    type: "required",
  },
];

const candidates = gradesUtil.buildScheduleGradeCandidates(
  schedule,
  existingGrades,
  "y2",
  "fall",
  "elective",
);
assert.equal(candidates.length, 3, "duplicate slots & blank names must collapse");
assert.deepEqual(candidates[0], {
  name: "数据结构（A）",
  credit: 4,
  alreadyExists: true,
  defaultTypeId: "elective",
});
assert.deepEqual(candidates[1], {
  name: "计算机网络",
  credit: 3,
  alreadyExists: false,
  defaultTypeId: "elective",
});
assert.deepEqual(candidates[2], {
  name: "形势与政策",
  credit: null,
  alreadyExists: false,
  defaultTypeId: "elective",
});

assert.deepEqual(
  gradesUtil.buildScheduleGradeCandidates(null, existingGrades, "y2", "fall"),
  [],
);

// 4. End-to-end check: blank-score schedule import via upsertGrades doesn't corrupt stats
useStore.getState().resetToSample();
const yId = useStore.getState().gradeYears[0].id;
const upserted = useStore.getState().upsertGrades(
  [
    {
      name: "计算机网络",
      credit: 3,
      scoreType: "numeric",
      score: "",
      gpa: null,
      yearId: yId,
      semester: "fall",
      type: "required",
    },
  ],
  "skipDuplicates",
);
assert.deepEqual(upserted, { added: 1, updated: 0, skipped: 0 });
const draftStats = gradesUtil.calcGradeStats(
  undefined,
  useStore.getState().grades,
);
assert.equal(draftStats.earnedCredits, 0);
assert.equal(draftStats.missing, 1);
assert.equal(draftStats.value, null);

console.log(
  "PASS: term GPA trend, credit distribution audit, schedule-to-grade candidate deduplication & draft upsert",
);

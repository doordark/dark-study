const assert = require("node:assert/strict");

const disk = new Map();
const storage = {
  getItem: async (k) => disk.get(k) ?? null,
  setItem: async (k, v) => { disk.set(k, v); },
  removeItem: async (k) => { disk.delete(k); },
  multiGet: async (keys) => keys.map((k) => [k, disk.get(k) ?? null]),
  multiSet: async (rows) => rows.forEach(([k, v]) => disk.set(k, v)),
  multiRemove: async (keys) => keys.forEach((k) => disk.delete(k)),
};

const load = require("./load-project-ts.cjs")({
  "@react-native-async-storage/async-storage": storage,
  "react-native": { Platform: { OS: "android" } },
  "expo-secure-store": {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  },
});

const gradesUtil = load("src/utils/grades.ts");
const { projectGrades } = load("src/utils/gradeProjection.ts");
const { useStore } = load("src/store/useStore.ts");
const { useSettings, sanitizeGraduationCreditTargets } = load("src/store/useSettings.ts");
const backup = load("src/utils/backup.ts");

// 1. Multi-scale GPA conversion + upper clamp + letter/text consistency
assert.equal(gradesUtil.numericScoreToGpa(100, "five"), 5.0);
assert.equal(gradesUtil.numericScoreToGpa(130, "five"), 5.0); // upper clamped
assert.equal(gradesUtil.numericScoreToGpa(59, "five"), 0);
assert.equal(gradesUtil.numericScoreToGpa(95, "four_std"), 4.0);
assert.equal(gradesUtil.numericScoreToGpa(86, "four_std"), 3.7);
assert.equal(gradesUtil.numericScoreToGpa(85, "four_pku"), 3.58);
assert.equal(gradesUtil.numericScoreToGpa(96, "four_three"), 4.3);
assert.equal(gradesUtil.numericScoreToGpa(95, "four_linear"), 4.0);
assert.equal(gradesUtil.numericScoreToGpa(85, "four_linear"), 3.5);

assert.equal(gradesUtil.deriveGpa("text", "优秀", "five"), 4.5);
assert.equal(gradesUtil.deriveGpa("text", "优秀", "four_std"), 4.0);
assert.equal(gradesUtil.deriveGpa("letter", "C-", "four_std"), 1.7);
assert.equal(gradesUtil.deriveGpa("letter", "A+", "four_three"), 4.3);
assert.equal(gradesUtil.deriveGpa("letter", "A+", "five"), 5.0);

// 2. Course GPA display precision (keeps 2 decimals when meaningful)
assert.equal(gradesUtil.formatCourseGpa(3.75), "3.75");
assert.equal(gradesUtil.formatCourseGpa(3.33), "3.33");
assert.equal(gradesUtil.formatCourseGpa(3.0), "3.0");
assert.equal(gradesUtil.formatCourseGpa(3.7), "3.7");
assert.equal(gradesUtil.formatCourseGpa(null), "--");

// 3. Weighted percentage score + earned credits (includes pass/fail)
const sampleGrades = [
  { id: "g1", name: "高数", credit: 4, scoreType: "numeric", score: "90", gpa: 4.0, yearId: "y1", semester: "fall", type: "required" },
  { id: "g2", name: "线代", credit: 2, scoreType: "numeric", score: "75", gpa: 2.5, yearId: "y1", semester: "fall", type: "required" },
  { id: "g3", name: "劳动课", credit: 2, scoreType: "text", score: "合格", gpa: null, yearId: "y1", semester: "fall", type: "general" },
  { id: "g4", name: "挂科课", credit: 3, scoreType: "numeric", score: "45", gpa: 0, yearId: "y1", semester: "fall", type: "elective" },
];
const stats = gradesUtil.calcGradeStats(undefined, sampleGrades);
assert.equal(stats.credits, 9);
assert.equal(stats.earnedCredits, 8); // 4 + 2 + 2 (passing) - 3 (failed)
assert.equal(stats.weightedScoreCount, 3);
// (90*4 + 75*2 + 45*3) / (4+2+3) = 645 / 9 = 71.666...
assert.equal(gradesUtil.formatWeightedScore(stats.weightedScore), "71.67");

// 4. Custom grade type mapping
const customTypes = [
  { id: "required", name: "必修课" },
  { id: "type-pe", name: "体育课" },
  { id: "type-core", name: "专业核心课" },
];
const mapped = gradesUtil.normalizeGradeInput(
  { name: "篮球", credit: 1, score: "92", type: "体育" },
  { scale: "four_std", types: customTypes },
);
assert.equal(mapped.type, "type-pe");
assert.equal(mapped.gpa, 4.0);

// 5. Projection under 4.0 standard scale
const proj4 = projectGrades(
  [{ id: "base", name: "A", credit: 3, scoreType: "numeric", score: "80", gpa: 3.0, yearId: "y1", semester: "fall", type: "required" }],
  undefined,
  [{ id: 1, credit: "3", score: "", type: "required" }],
  3.5,
  1,
  "four_std",
);
assert.equal(proj4.requiredScore, 90); // need 4.0 -> min integer score 90 in four_std

// 6. Store: zombie excludedCourseIds cleanup + upsertGrades dedupe + recalculateGradesGpa
useStore.getState().resetToSample();
const yearId = useStore.getState().gradeYears[0].id;
const ruleId = useStore.getState().gradeRules[0].id;
const id1 = useStore.getState().addGrade({
  name: "数据结构",
  credit: 4,
  scoreType: "numeric",
  score: "95",
  gpa: 4.5,
  yearId,
  semester: "fall",
  type: "required",
});
const id2 = useStore.getState().addGrade({
  name: "操作系统",
  credit: 3,
  scoreType: "numeric",
  score: "85",
  gpa: 3.5,
  yearId,
  semester: "fall",
  type: "required",
});
useStore.getState().updateGradeRule(ruleId, { excludedCourseIds: [id1, id2] });
useStore.getState().removeGrade(id1);
assert.deepEqual(
  useStore.getState().gradeRules[0].excludedCourseIds,
  [id2],
  "removeGrade must prune deleted id from excludedCourseIds",
);
useStore.getState().removeGrades([id2]);
assert.deepEqual(
  useStore.getState().gradeRules[0].excludedCourseIds,
  [],
  "removeGrades must prune deleted ids from excludedCourseIds",
);

const firstInsert = useStore.getState().upsertGrades(
  [
    { name: "编译原理", credit: 3, scoreType: "numeric", score: "88", gpa: 3.8, yearId, semester: "fall", type: "required" },
  ],
  "skipDuplicates",
);
assert.deepEqual(firstInsert, { added: 1, updated: 0, skipped: 0 });
const skipDup = useStore.getState().upsertGrades(
  [
    { name: "编译原理", credit: 3, scoreType: "numeric", score: "96", gpa: 4.6, yearId, semester: "fall", type: "required" },
    { name: "计算机网络", credit: 3, scoreType: "numeric", score: "92", gpa: 4.2, yearId, semester: "fall", type: "required" },
  ],
  "skipDuplicates",
);
assert.deepEqual(skipDup, { added: 1, updated: 0, skipped: 1 });
const overwriteDup = useStore.getState().upsertGrades(
  [
    { name: "编译原理", credit: 3, scoreType: "numeric", score: "96", gpa: 4.6, yearId, semester: "fall", type: "required" },
  ],
  "overwriteDuplicates",
);
assert.deepEqual(overwriteDup, { added: 0, updated: 1, skipped: 0 });
assert.equal(useStore.getState().grades.find((g) => g.name === "编译原理").score, "96");

const recalcCount = useStore.getState().recalculateGradesGpa("four_std");
assert.equal(recalcCount, 2);
assert.equal(useStore.getState().grades.find((g) => g.name === "编译原理").gpa, 4.0);

// 7. Backup whitelist accepts valid gpaScale and rejects invalid values
const validBackup = backup.createBackup([
  ["dark-study-settings", JSON.stringify({ version: 0, state: { gpaScale: "four_pku" } })],
]);
assert.equal(validBackup.data["dark-study-settings"].state.gpaScale, "four_pku");
const badScale = structuredClone(validBackup);
badScale.data["dark-study-settings"].state.gpaScale = "invalid_scale";
assert.throws(() => backup.parseBackup(JSON.stringify(badScale)), /绩点制/);

// 8. Retake override policy: "all" (default) vs "highest" vs "latest"
const retakeYears = [
  { id: "y-first", name: "大一" },
  { id: "y-second", name: "大二" },
];
const retakeGrades = [
  // Retake case 1: failed then passed (name formatting differs via full-width parens/spaces)
  { id: "r1", name: "高等数学（A）", credit: 4, scoreType: "numeric", score: "52", gpa: 0, yearId: "y-first", semester: "fall", type: "required" },
  { id: "r2", name: "高等数学(A) ", credit: 4, scoreType: "numeric", score: "85", gpa: 3.5, yearId: "y-second", semester: "fall", type: "required" },
  // Retake case 2: passed high then retook lower score (tests highest vs latest & earnedCredits dedupe)
  { id: "r3", name: "大学物理", credit: 3, scoreType: "numeric", score: "88", gpa: 3.8, yearId: "y-first", semester: "spring", type: "required" },
  { id: "r4", name: "大学物理", credit: 3, scoreType: "numeric", score: "75", gpa: 2.5, yearId: "y-second", semester: "spring", type: "required" },
  // Retake case 3: same GPA (4.0), tie-break by numeric score (96 beats 91 even though 96 is earlier)
  { id: "r5", name: "离散数学", credit: 2, scoreType: "numeric", score: "96", gpa: 4.0, yearId: "y-first", semester: "fall", type: "required" },
  { id: "r6", name: "离散数学", credit: 2, scoreType: "numeric", score: "91", gpa: 4.0, yearId: "y-first", semester: "spring", type: "required" },
  // Retake case 4: same GPA & same numeric score, tie-break by later record (y-second beats y-first)
  { id: "r7", name: "英语读写", credit: 2, scoreType: "numeric", score: "90", gpa: 4.0, yearId: "y-second", semester: "fall", type: "elective" },
  { id: "r8", name: "英语读写", credit: 2, scoreType: "numeric", score: "90", gpa: 4.0, yearId: "y-first", semester: "fall", type: "elective" },
];

// 8a. Default (undefined) and "all" preserve existing behavior 100%
const statsDefault = gradesUtil.calcGradeStats(undefined, retakeGrades, retakeYears);
const statsAll = gradesUtil.calcGradeStats(
  { id: "rule-all", name: "全部", excludedTypes: [], excludedCourseIds: [], retakePolicy: "all" },
  retakeGrades,
  retakeYears,
);
assert.deepEqual(statsAll, statsDefault);
assert.equal(statsAll.overriddenCount, 0);
assert.equal(statsAll.count, 8);
assert.equal(statsAll.credits, 22);
assert.equal(statsAll.earnedCredits, 18); // all except failed r1 (4)

// 8b. "highest": keeps r2 (3.5), r3 (3.8), r5 (4.0/96), r7 (4.0/90 later)
const ruleHighest = {
  id: "rule-highest",
  name: "重修取最高",
  excludedTypes: [],
  excludedCourseIds: [],
  retakePolicy: "highest",
};
const effHighest = gradesUtil.resolveEffectiveGrades(ruleHighest, retakeGrades, retakeYears);
assert.deepEqual(
  effHighest.included.map((g) => g.id),
  ["r2", "r3", "r5", "r7"],
);
assert.deepEqual(
  [...effHighest.overriddenIds].sort(),
  ["r1", "r4", "r6", "r8"],
);
const statsHighest = gradesUtil.calcGradeStats(ruleHighest, retakeGrades, retakeYears);
assert.equal(statsHighest.count, 4);
assert.equal(statsHighest.credits, 11); // 4 + 3 + 2 + 2
assert.equal(statsHighest.earnedCredits, 11); // no double-counting overridden passed retakes
assert.equal(statsHighest.overriddenCount, 4);
// GPA = (3.5*4 + 3.8*3 + 4.0*2 + 4.0*2) / 11 = (14 + 11.4 + 8 + 8) / 11 = 41.4 / 11
assert.ok(Math.abs(statsHighest.value - 41.4 / 11) < 1e-9);
// WeightedScore = (85*4 + 88*3 + 96*2 + 90*2) / 11 = (340 + 264 + 192 + 180) / 11 = 976 / 11
assert.ok(Math.abs(statsHighest.weightedScore - 976 / 11) < 1e-9);

// 8c. "latest": keeps r2 (y-second fall), r4 (y-second spring), r6 (y-first spring > fall), r7 (y-second > y-first)
const ruleLatest = {
  id: "rule-latest",
  name: "重修取最新",
  excludedTypes: [],
  excludedCourseIds: [],
  retakePolicy: "latest",
};
const effLatest = gradesUtil.resolveEffectiveGrades(ruleLatest, retakeGrades, retakeYears);
assert.deepEqual(
  effLatest.included.map((g) => g.id),
  ["r2", "r4", "r6", "r7"],
);
assert.deepEqual(
  [...effLatest.overriddenIds].sort(),
  ["r1", "r3", "r5", "r8"],
);
const statsLatest = gradesUtil.calcGradeStats(ruleLatest, retakeGrades, retakeYears);
assert.equal(statsLatest.count, 4);
assert.equal(statsLatest.credits, 11);
assert.equal(statsLatest.earnedCredits, 11);
assert.equal(statsLatest.overriddenCount, 4);
// GPA = (3.5*4 + 2.5*3 + 4.0*2 + 4.0*2) / 11 = 37.5 / 11
assert.ok(Math.abs(statsLatest.value - 37.5 / 11) < 1e-9);
// WeightedScore = (85*4 + 75*3 + 91*2 + 90*2) / 11 = 927 / 11
assert.ok(Math.abs(statsLatest.weightedScore - 927 / 11) < 1e-9);

// 8d. Structured yearId fallback without gradeYears (scrambled [y2, y1] -> y2 wins)
const scrambledRetake = [
  { id: "s-new", name: "编译原理", credit: 3, scoreType: "numeric", score: "78", gpa: 2.8, yearId: "y2", semester: "fall", type: "required" },
  { id: "s-old", name: "编译原理", credit: 3, scoreType: "numeric", score: "60", gpa: 1.0, yearId: "y1", semester: "spring", type: "required" },
];
const effFallback = gradesUtil.resolveEffectiveGrades(ruleLatest, scrambledRetake);
assert.deepEqual(effFallback.included.map((g) => g.id), ["s-new"]);
assert.ok(effFallback.overriddenIds.has("s-old"));

// 8e. Manually excluding winning attempt leaves remaining attempt active (not overridden)
const ruleManualExclude = {
  id: "rule-excl",
  name: "手动排除新版",
  excludedTypes: [],
  excludedCourseIds: ["r2"],
  retakePolicy: "highest",
};
const effExcl = gradesUtil.resolveEffectiveGrades(ruleManualExclude, retakeGrades.slice(0, 2), retakeYears);
assert.deepEqual(effExcl.included.map((g) => g.id), ["r1"]);
assert.equal(effExcl.overriddenIds.size, 0);

// 8f. Multiple unnamed projection placeholder courses do not collide under retakePolicy
const projHighest = projectGrades(
  [{ id: "base1", name: "高数", credit: 4, scoreType: "numeric", score: "80", gpa: 3.0, yearId: "y1", semester: "fall", type: "required" }],
  ruleHighest,
  [
    { id: 1, credit: "2", score: "90", type: "required" },
    { id: 2, credit: "2", score: "100", type: "required" },
  ],
  undefined,
  null,
  "five",
);
// (3.0*4 + 4.0*2 + 5.0*2) / 8 = 30 / 8 = 3.75
assert.equal(projHighest.projection.credits, 8);
assert.ok(Math.abs(projHighest.projection.value - 3.75) < 1e-9);

// 9. Graduation credit progress tracker + passed retake deduplication + settings persistence
const gradTypes = [
  { id: "required", name: "必修课" },
  { id: "elective", name: "选修课" },
  { id: "general", name: "通识选修课" },
  { id: "type-prac", name: "实践环节" },
];
const gradGrades = [
  // Fail then pass -> 4 credits, dedupedRetakeCount = 0
  { id: "gg1", name: "高等数学", credit: 4, scoreType: "numeric", score: "50", gpa: 0, yearId: "y1", semester: "fall", type: "required" },
  { id: "gg2", name: "高等数学", credit: 4, scoreType: "numeric", score: "82", gpa: 3.2, yearId: "y2", semester: "fall", type: "required" },
  // Passed twice (刷分重修) -> MUST count ONLY ONCE (3 credits, NOT 6!), dedupedRetakeCount +1
  { id: "gg3", name: "线性代数", credit: 3, scoreType: "numeric", score: "68", gpa: 1.8, yearId: "y1", semester: "fall", type: "required" },
  { id: "gg4", name: "线性代数 ", credit: 3, scoreType: "numeric", score: "95", gpa: 4.5, yearId: "y2", semester: "spring", type: "required" },
  // Passed twice where winning retake has missing credit -> falls back to earlier valid credit (2)
  { id: "gg5", name: "大学英语", credit: 2, scoreType: "numeric", score: "70", gpa: 2.0, yearId: "y1", semester: "fall", type: "required" },
  { id: "gg6", name: "大学英语", credit: null, scoreType: "numeric", score: "92", gpa: 4.2, yearId: "y2", semester: "fall", type: "required" },
  // Failed only -> 0 earned
  { id: "gg7", name: "量子力学", credit: 3, scoreType: "numeric", score: "42", gpa: 0, yearId: "y1", semester: "spring", type: "elective" },
  // Passed elective -> 3 credits
  { id: "gg8", name: "机器学习", credit: 3, scoreType: "numeric", score: "88", gpa: 3.8, yearId: "y2", semester: "fall", type: "elective" },
  // Pass/fail text general -> 2 credits
  { id: "gg9", name: "劳动教育", credit: 2, scoreType: "text", score: "合格", gpa: null, yearId: "y1", semester: "summer", type: "general" },
  // Custom category exceeding target -> ratio clamped at 1, remainingCredits = 0
  { id: "gg10", name: "毕业实习", credit: 6, scoreType: "text", score: "通过", gpa: null, yearId: "y2", semester: "summer", type: "type-prac" },
];
const gradTargets = { required: 12, elective: 6, general: 4, "type-prac": 4 };
const gradProgress = gradesUtil.computeGraduationProgress(
  gradGrades,
  gradTypes,
  gradTargets,
  undefined,
  [
    { id: "y1", name: "大一" },
    { id: "y2", name: "大二" },
  ],
);
assert.equal(gradProgress.hasTargets, true);
assert.equal(gradProgress.dedupedRetakeCount, 2); // 线性代数 + 大学英语
assert.equal(gradProgress.passedCourseCount, 6); // 高数, 线代, 英语, 机器学习, 劳动教育, 毕业实习
// Earned: required = 4+3+2 = 9, elective = 3, general = 2, type-prac = 6 -> total = 20
assert.equal(gradProgress.totalEarnedCredits, 20);
assert.equal(gradProgress.totalTargetCredits, 26); // 12+6+4+4
assert.equal(gradProgress.overallRemainingCredits, 6);
assert.ok(Math.abs(gradProgress.overallRatio - 20 / 26) < 1e-9);

const catById = Object.fromEntries(gradProgress.categories.map((c) => [c.typeId, c]));
assert.equal(catById.required.earnedCredits, 9);
assert.equal(catById.required.targetCredits, 12);
assert.equal(catById.required.remainingCredits, 3);
assert.equal(catById.required.ratio, 0.75);
assert.equal(catById.elective.earnedCredits, 3);
assert.equal(catById.elective.remainingCredits, 3);
assert.equal(catById.general.earnedCredits, 2);
assert.equal(catById.general.ratio, 0.5);
assert.equal(catById["type-prac"].earnedCredits, 6);
assert.equal(catById["type-prac"].targetCredits, 4);
assert.equal(catById["type-prac"].ratio, 1); // clamped at 1
assert.equal(catById["type-prac"].remainingCredits, 0);

// Explicit total target override via GRADUATION_TOTAL_TARGET_KEY
const gradOverride = gradesUtil.computeGraduationProgress(
  gradGrades,
  gradTypes,
  { [gradesUtil.GRADUATION_TOTAL_TARGET_KEY]: 150, required: 90 },
);
assert.equal(gradOverride.totalTargetCredits, 150);
assert.equal(gradOverride.overallRemainingCredits, 130);

// Graduation progress respects rule exclusions when provided
const gradWithRule = gradesUtil.computeGraduationProgress(
  gradGrades,
  gradTypes,
  gradTargets,
  { id: "no-gen", name: "不含通识", excludedTypes: ["general"], excludedCourseIds: [] },
);
assert.equal(gradWithRule.totalEarnedCredits, 18); // 20 - 2 (general)

// Preset target generator sums accurately for standard and custom types
const preset160 = gradesUtil.buildGraduationPresetTargets(160, gradTypes.slice(0, 3));
assert.equal(Object.values(preset160).reduce((a, b) => a + b, 0), 160);
assert.deepEqual(preset160, { required: 100, elective: 40, general: 20 });
const preset150Custom = gradesUtil.buildGraduationPresetTargets(150, gradTypes);
assert.equal(Object.values(preset150Custom).reduce((a, b) => a + b, 0), 150);

// useSettings graduationCreditTargets actions + sanitization
assert.deepEqual(useSettings.getState().graduationCreditTargets, {});
useSettings.getState().setGraduationCreditTarget("required", 95.5);
assert.deepEqual(useSettings.getState().graduationCreditTargets, { required: 95.5 });
useSettings.getState().setGraduationCreditTarget("elective", 35);
assert.deepEqual(useSettings.getState().graduationCreditTargets, { required: 95.5, elective: 35 });
useSettings.getState().setGraduationCreditTarget("required", null);
assert.deepEqual(useSettings.getState().graduationCreditTargets, { elective: 35 });
useSettings.getState().setGraduationCreditTargets({
  required: 100,
  badNeg: -5,
  badZero: 0,
  badNaN: Number.NaN,
  tooHuge: 999,
  __proto__: 42,
});
assert.deepEqual(useSettings.getState().graduationCreditTargets, {
  required: 100,
  tooHuge: 500,
});
assert.deepEqual(sanitizeGraduationCreditTargets(null), {});

console.log(
  "PASS: multi-scale GPA, retake override policies, graduation credit progress, settings targets, custom grade types, zombie rule cleanup, grade dedupe upsert & backup validation",
);

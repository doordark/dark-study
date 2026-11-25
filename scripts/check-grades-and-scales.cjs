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
});

const gradesUtil = load("src/utils/grades.ts");
const { projectGrades } = load("src/utils/gradeProjection.ts");
const { useStore } = load("src/store/useStore.ts");
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

console.log("PASS: multi-scale GPA, weighted score/earned credits, custom grade types, zombie rule cleanup, grade dedupe upsert & backup validation");

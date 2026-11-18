const assert = require("node:assert/strict");
const load = require("./load-project-ts.cjs")();
const { projectGrades } = load("src/utils/gradeProjection.ts");

const baseline = [{ id: "existing", gpa: 3.5, credit: 3, type: "required", yearId: "year", semester: "fall" }];
const courses = [
  { id: 1, credit: "3", score: "85", type: "required" },
  { id: 2, credit: "3", score: "90", type: "required" },
  { id: 3, credit: "3", score: "", type: "elective" },
];
const rule = { id: "rule", name: "只计必修", excludedTypes: ["elective"], excludedCourseIds: [] };
const result = projectGrades(baseline, rule, courses, 3.7, 2);
assert.equal(result.actual.value, 3.5);
assert.equal(result.projection.value.toFixed(2), "3.67");
assert.equal(result.requiredScore, 91);
assert.equal(projectGrades(baseline, rule, courses, 4.1, 2).requiredScore, null);
assert.equal(projectGrades(baseline, rule, courses, 3.7, 3).requiredScore, undefined);
assert.equal(projectGrades(baseline, undefined, courses, 3.7, 2).requiredScore, undefined);
assert.equal(projectGrades(baseline, rule, [{ ...courses[0], score: "" }, courses[1]], 3.7, 1).requiredScore, 86);
assert.deepEqual(baseline.map(row => row.gpa), [3.5]);
console.log("PASS: multiple hypothetical grades, rule exclusions and minimum integer target score without editing official grades");

const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

const calls = [];
const pending = [true, true];
const load = createLoader({
  "@/services/ai": {
    gradeImportKey: grade => grade.name,
    dedupeGrades: (grades) => [...new Map(grades.map(grade => [grade.name, grade])).values()],
    async recognizeGradesBatch(images, key, semester, options) {
      calls.push(images.map(image => image.uri));
      const grades = [];
      images.forEach((image, i) => {
        if (image.uri === "2" && pending.shift()) options.onPageFailure(i);
        else {
          const rows = [{ name: image.uri, score: "90", semester }];
          if (image.uri === "2") rows.push({ name: "1", score: "90", semester });
          grades.push(...rows);
          options.onPageRows(i, rows);
        }
      });
      if (!grades.length) throw new Error("识别失败");
      return { grades };
    },
  },
});

async function run() {
  const { useImportTask: task } = load("src/store/useImportTask.ts");
  const { runImageImportTask } = load("src/services/imageImportTask.ts");
  const images = ["1", "2", "3"].map(uri => ({ uri, imageBase64: "", mimeType: "image/jpeg" }));
  task.getState().open("grades", "3 张照片");
  await runImageImportTask({ type: "grades", images, isOnline: async () => false, apiKey: "", semester: "fall", yearId: "year" });
  const first = task.getState();
  assert.deepEqual(first.retry.pages, [2]);
  assert.deepEqual(first.result.grades.map(grade => grade.name), ["1", "3"]);
  assert.deepEqual(first.result.sources.map(source => source.pages), [[1], [3]]);
  assert(task.getState().editGrade(first.result, 0, { ...first.result.grades[0], name: "已修正", score: "98" }));
  await first.retry.run();
  const second = task.getState();
  assert.deepEqual(second.retry.pages, [2]);
  assert.deepEqual(second.result.grades.map(grade => grade.name), ["已修正", "3"]);
  await first.retry.run();
  await second.retry.run();
  const final = task.getState();
  assert.equal(final.retry, null);
  assert.equal(final.result.yearId, "year");
  assert.deepEqual(final.result.grades.map(grade => grade.name), ["已修正", "3", "2"]);
  assert.equal(final.result.grades[0].score, "98");
  assert.deepEqual(final.result.sources[0].pages, [1, 2]);
  assert(!task.getState().editGrade(first.result, 0, first.result.grades[0]));
  assert.deepEqual(calls, [["1", "2", "3"], ["2"], ["2"]]);
  task.getState().clear();
  console.log("PASS: partial photo import retains recognized rows, retries only the original failed page, and rejects stale retry actions");
}
run().catch(error => { console.error(error); process.exitCode = 1; });

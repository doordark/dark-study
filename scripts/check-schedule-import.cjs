const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

let response;
const mocks = {
  "@/services/deepseek": { chatJson: async () => response },
  "@/services/offlineImport": {},
  "@/services/whaleContext": {},
  "@/utils/whaleMemory": {},
  "@/utils/whalePersona": {},
  "@/store/useWhalePersona": {},
};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name);
  }, mod, mod.exports);
  return mod.exports;
}

async function run() {
  const ai = load("src/services/ai.ts");
  const ctx = { startDate: "2026-09-07", totalWeeks: 16 };
  const course = { name: "数学", weekday: 1, startPeriod: 1, endPeriod: 2 };
  const importCourse = async patch => {
    response = { courses: [{ ...course, ...patch }] };
    return (await ai.recognizeScheduleFromText("课表", "mock", ctx)).courses;
  };
  assert.deepEqual(await importCourse({ dates: ["2027-09-07"], weeks: [1, 2] }), []);
  assert.deepEqual(await importCourse({ dates: ["2026-02-30"] }), []);
  assert.deepEqual(await importCourse({ weeks: [99] }), []);
  assert.deepEqual(await importCourse({ weeks: [1.5] }), []);
  assert.deepEqual(await importCourse({ weekday: 1.5 }), []);
  assert.deepEqual((await importCourse({ dates: ["2026-09-14", "2027-09-07"], weeks: [1] }))[0].weeks, [2]);
  assert.deepEqual((await importCourse({ weeks: "第4周到第2周、8" }))[0].weeks, [2, 3, 4, 8]);
  assert.deepEqual((await importCourse({ weeks: "1-999999999999999999999" }))[0].weeks, Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal((await importCourse({ weeks: [] }))[0].weeks.length, 16);
  for (const credits of [null, "", "  ", undefined]) {
    assert.equal((await importCourse({ credits }))[0].credits, undefined);
  }
  assert.equal((await importCourse({ credits: 0 }))[0].credits, 0);
  assert.equal((await importCourse({ credits: "2.5" }))[0].credits, 2.5);
  response = { periods: [
    { startTime: "8:00", endTime: "08:45" },
    { startTime: "25:00", endTime: "26:00" },
    { startTime: "09:60", endTime: "10:45" },
    { startTime: "11:00", endTime: "10:00" },
  ] };
  assert.deepEqual(await ai.recognizePeriods({ text: "作息表" }, "mock"), [
    { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  ]);

  // Compare the optimized conflict detector to a simple reference on varied inputs.
  const time = load("src/utils/time.ts");
  const periods = Array.from({ length: 8 }, (_, i) => ({ index: i + 1, startTime: `${String(8 + i).padStart(2, "0")}:00`, endTime: `${String(8 + i).padStart(2, "0")}:45` }));
  const courses = Array.from({ length: 60 }, (_, i) => ({
    ...course, id: String(i), name: `课程${i}`, weekday: i % 7 + 1,
    startPeriod: i % 6 + 1, endPeriod: i % 6 + 2, weeks: [i % 3 + 1, i % 5 + 1],
    ...(i % 4 === 0 ? { startTime: "09:15", endTime: "10:15" } : {}),
  }));
  for (const week of [undefined, 1, 2, 5, 9]) {
    for (const bells of [undefined, periods]) {
      const expected = new Map();
      const list = courses.filter(c => week == null || c.weeks.includes(week));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.weekday !== b.weekday || !a.weeks.some(w => b.weeks.includes(w))) continue;
        if (bells) {
          const at = time.getCourseTime(bells, a.startPeriod, a.endPeriod, a);
          const bt = time.getCourseTime(bells, b.startPeriod, b.endPeriod, b);
          if (at.startMinutes >= bt.endMinutes || at.endMinutes <= bt.startMinutes) continue;
        } else if (a.startPeriod > b.endPeriod || a.endPeriod < b.startPeriod) continue;
        expected.set(a.id, [...(expected.get(a.id) ?? []), b.name]);
        expected.set(b.id, [...(expected.get(b.id) ?? []), a.name]);
      }
      assert.deepEqual(time.findConflicts(courses, week, bells), expected);
    }
  }
  console.log("PASS: schedule import boundaries, credits, bell times and conflict equivalence");
}
run().catch(error => { console.error(error); process.exitCode = 1; });

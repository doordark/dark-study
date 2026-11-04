const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const cache = new Map();
const calls = [];
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const target = new Module(filename, module);
  cache.set(filename, target);
  target.require = (request) => {
    if (request === "react-native") return { Platform: { OS: "android" }, NativeModules: { CourseWidget: {
      sync: async (payload) => calls.push(JSON.parse(payload)), pin: async (shape) => shape === "large",
    } } };
    if (request.startsWith("@/")) return load(`src/${request.slice(2)}.ts`);
    return require(request);
  };
  target._compile(compiled.outputText, filename);
  return target.exports;
}

async function run() {
  const { upcomingWidgetCourses: upcoming, widgetDayLabel } = load("src/utils/courseWidget.ts");
  const base = {
    id: "term", name: "秋季", kind: "fall", startDate: "2026-11-02", endDate: "2026-11-15", totalWeeks: 2,
    periods: [{ index: 1, startTime: "08:00", endTime: "08:45" }, { index: 2, startTime: "09:00", endTime: "09:45" }],
    courses: [{ id: "math", name: "高数", teacher: "老师", classroom: "A101", weekday: 2, startPeriod: 1, endPeriod: 2, weeks: [1, 1, 2], color: "sky" }],
  };
  const now = new Date("2026-11-03T08:30:00");
  const rows = upcoming(base, now);
  assert.equal(rows.length, 2, "deduplicate weeks, retain current and next-week lessons");
  assert.equal(rows[0].classroom, "A101");
  assert.equal(rows[0].time, "08:00–09:45");
  assert(rows[0].start <= +now && rows[0].end > +now, "ongoing lesson remains visible");
  assert.equal(upcoming(base, new Date("2026-11-03T09:45:00")).length, 1, "drop lesson at its end boundary");
  assert.equal(widgetDayLabel(rows[0].start, now), "今天");
  assert.equal(widgetDayLabel(rows[0].start, new Date("2026-11-02T23:59:00")), "明天");
  assert.equal(widgetDayLabel(rows[1].start, now), "11/10 周二");
  assert.equal(upcoming(base, new Date("2026-11-16T00:00:00")).length, 0, "semester ended");
  assert.deepEqual(upcoming(undefined, now), []);
  assert.deepEqual(upcoming({ ...base, courses: [] }, now), []);
  assert.equal(upcoming({ ...base, endDate: "2026-11-09" }, now).length, 1, "respect last teaching date");
  assert.equal(upcoming({ ...base, startDate: "2026-11-04" }, now).length, 1, "anchor weeks to Monday but exclude dates before start");
  for (const patch of [{ weekday: 0 }, { weekday: 8 }, { startPeriod: 99 }, { endPeriod: 99 }, { weeks: [0, -1, 3, 1.5] }]) {
    assert.equal(upcoming({ ...base, courses: [{ ...base.courses[0], ...patch }] }, now).length, 0);
  }
  const invalidTime = { ...base, periods: [{ index: 1, startTime: "25:00", endTime: "09:00" }] };
  assert.equal(upcoming(invalidTime, now).length, 0);
  const multi = { ...base, courses: [
    { ...base.courses[0], id: "tomorrow", weekday: 3 }, base.courses[0],
    { ...base.courses[0], id: "sunday", weekday: 7, weeks: [1] },
  ] };
  assert.deepEqual(upcoming(multi, now).slice(0, 3).map((r) => r.id), ["math-2026-11-03", "tomorrow-2026-11-04", "sunday-2026-11-08"]);
  const native = load("src/services/courseWidget.ts");
  await native.syncCourseWidgets(base, 4, "light");
  await native.syncCourseWidgets(undefined, 2, "dark");
  assert.equal(calls[0].schedule.id, "term");
  assert.equal(calls[0].count, 4);
  assert.equal(calls[1].schedule, null, "empty state replaces previous schedule");
  assert.equal(await native.pinCourseWidget("large"), true);
  assert.equal(await native.pinCourseWidget("square"), false, "unsupported pinning permits manual-add fallback");
  console.log("Course widgets: recurrence, date boundaries, current lessons, invalid data, sorting, empty state and native sync passed.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });

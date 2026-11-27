const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = process.cwd();

function createTsLoader(mocks = {}) {
  const cache = new Map();

  function resolveLocal(specifier, fromFile) {
    let base;
    if (specifier.startsWith("@/")) {
      base = path.join(ROOT, "src", specifier.slice(2));
    } else if (specifier.startsWith(".")) {
      base = path.resolve(path.dirname(fromFile), specifier);
    } else {
      return null;
    }
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
  }

  function load(filePath) {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(ROOT, filePath);
    if (cache.has(abs)) return cache.get(abs).exports;

    const source = fs.readFileSync(abs, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: abs,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    const mod = { exports: {} };
    cache.set(abs, mod);

    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
        return mocks[specifier];
      }
      const resolved = resolveLocal(specifier, abs);
      if (resolved) return load(resolved);
      return require(specifier);
    };

    new Function("require", "module", "exports", compiled)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  return { load };
}

const PERIODS = [
  { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
  { index: 3, label: "第3节", startTime: "10:00", endTime: "10:45" },
  { index: 4, label: "第4节", startTime: "10:55", endTime: "11:40" },
  { index: 5, label: "第5节", startTime: "14:00", endTime: "14:45" },
  { index: 6, label: "第6节", startTime: "14:55", endTime: "15:40" },
];

// 2026-08-31 is Monday (Week 1). 6 weeks -> endDate 2026-10-11 (Sunday).
// Week 5 Mon = 2026-09-28, Wed = 2026-09-30, Thu = 2026-10-01, Sun = 2026-10-04.
function makeSampleSchedule() {
  return {
    id: "term-2026-fall",
    name: "2026 秋季学期",
    kind: "fall",
    startDate: "2026-08-31",
    endDate: "2026-10-11",
    totalWeeks: 6,
    periods: PERIODS,
    courses: [
      {
        id: "c-mon-math",
        name: "高等数学 A",
        teacher: "胡柏遇",
        classroom: "新教楼 201",
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3, 4, 5, 6],
        color: "violet",
        credits: 5,
      },
      {
        id: "c-wed-math",
        name: "高等数学 A",
        teacher: "胡柏遇",
        classroom: "新教楼 201",
        weekday: 3,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3, 4, 5, 6],
        color: "violet",
        credits: 5,
      },
      {
        id: "c-wed-once",
        name: "国庆前专题讲座",
        teacher: "林教授",
        classroom: "报告厅, 一层;东",
        weekday: 3,
        startPeriod: 5,
        endPeriod: 6,
        weeks: [5],
        color: "amber",
        credits: 1,
        note: "需签到\n带校园卡",
      },
      {
        id: "c-thu-ds",
        name: "数据结构",
        teacher: "顾林",
        classroom: "尚七 513",
        weekday: 4,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [1, 2, 3, 4],
        color: "sky",
        credits: 4,
        note: "期末闭卷",
      },
      {
        id: "c-sun-lab",
        name: "开放实验课",
        teacher: "周雪",
        classroom: "实验楼 A305",
        weekday: 7,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [5, 6],
        color: "emerald",
        credits: 2,
      },
    ],
  };
}

function coursesOn(courses, week, weekday) {
  return courses.filter(
    (c) => c.weekday === weekday && c.weeks.includes(week),
  );
}

async function run() {
  /* ---------------- 1. holidayShift tests ---------------- */
  const { load: loadPure } = createTsLoader();
  const holiday = loadPure("src/utils/holidayShift.ts");
  const schedule = makeSampleSchedule();

  // dateToWeekAndWeekday validation
  assert.deepEqual(holiday.dateToWeekAndWeekday(schedule, "2026-08-31"), {
    week: 1,
    weekday: 1,
  });
  assert.deepEqual(holiday.dateToWeekAndWeekday(schedule, "2026-09-30"), {
    week: 5,
    weekday: 3,
  });
  assert.deepEqual(holiday.dateToWeekAndWeekday(schedule, "2026-10-04"), {
    week: 5,
    weekday: 7,
  });
  assert.equal(holiday.dateToWeekAndWeekday(schedule, "2026-08-30"), null);
  assert.equal(holiday.dateToWeekAndWeekday(schedule, "2026-10-12"), null);
  assert.equal(holiday.dateToWeekAndWeekday(schedule, "2026-02-30"), null);
  assert.equal(holiday.dateToWeekAndWeekday(schedule, "not-a-date"), null);

  // planHolidayCancelDay: removes only week 5 Wed, drops single-week course, preserves all other weeks
  const cancelRes = holiday.planHolidayCancelDay(schedule, "2026-09-30");
  assert.equal(cancelRes.affectedCount, 2);
  assert.equal(coursesOn(cancelRes.courses, 5, 3).length, 0);
  // Single-week course dropped completely
  assert.equal(
    cancelRes.courses.some((c) => c.id === "c-wed-once"),
    false,
  );
  // Multi-week Wed course keeps weeks [1,2,3,4,6] untouched
  const remainingWedMath = cancelRes.courses.find((c) => c.id === "c-wed-math");
  assert.deepEqual(remainingWedMath.weeks, [1, 2, 3, 4, 6]);
  // Other weekdays untouched
  assert.deepEqual(
    cancelRes.courses.find((c) => c.id === "c-mon-math").weeks,
    [1, 2, 3, 4, 5, 6],
  );
  assert.throws(
    () => holiday.planHolidayCancelDay(schedule, "2026-12-01"),
    /范围/,
  );

  // planHolidayMoveDay WITHOUT replaceTargetDay: moves Week 5 Wed -> Week 5 Sun, keeps existing Sun lab
  const moveKeepRes = holiday.planHolidayMoveDay(
    schedule,
    "2026-09-30",
    "2026-10-04",
  );
  assert.equal(moveKeepRes.movedCount, 2);
  assert.equal(moveKeepRes.clearedTargetCount, 0);
  assert.equal(coursesOn(moveKeepRes.courses, 5, 3).length, 0);
  const sunW5Keep = coursesOn(moveKeepRes.courses, 5, 7);
  assert.equal(sunW5Keep.length, 3, "2 moved + 1 existing Sunday course");
  assert.deepEqual(
    sunW5Keep.map((c) => c.name).sort(),
    ["国庆前专题讲座", "开放实验课", "高等数学 A"],
  );
  // Verify fresh IDs on moved single-week entries & non-target weeks untouched
  const shiftedIds = sunW5Keep
    .filter((c) => c.name !== "开放实验课")
    .map((c) => c.id);
  assert.equal(new Set(shiftedIds).size, 2);
  for (const id of shiftedIds) {
    assert.notEqual(id, "c-wed-math");
    assert.notEqual(id, "c-wed-once");
  }
  assert.deepEqual(
    moveKeepRes.courses.find((c) => c.id === "c-wed-math").weeks,
    [1, 2, 3, 4, 6],
  );
  assert.equal(coursesOn(moveKeepRes.courses, 6, 7).length, 1);

  // planHolidayMoveDay WITH replaceTargetDay: clears Week 5 Sun lab while preserving Week 6 Sun lab
  const moveReplaceRes = holiday.planHolidayMoveDay(
    schedule,
    "2026-09-30",
    "2026-10-04",
    { replaceTargetDay: true },
  );
  assert.equal(moveReplaceRes.movedCount, 2);
  assert.equal(moveReplaceRes.clearedTargetCount, 1);
  const sunW5Replace = coursesOn(moveReplaceRes.courses, 5, 7);
  assert.equal(sunW5Replace.length, 2);
  assert.deepEqual(
    sunW5Replace.map((c) => c.name).sort(),
    ["国庆前专题讲座", "高等数学 A"],
  );
  const remainingSunLab = moveReplaceRes.courses.find(
    (c) => c.id === "c-sun-lab",
  );
  assert.deepEqual(remainingSunLab.weeks, [6]);

  // Same-weekday move with replaceTargetDay: Week 1 Mon -> Week 2 Mon on same course
  const sameWeekdayMove = holiday.planHolidayMoveDay(
    schedule,
    "2026-08-31",
    "2026-09-07",
    { replaceTargetDay: true },
  );
  assert.equal(sameWeekdayMove.movedCount, 1);
  assert.equal(sameWeekdayMove.clearedTargetCount, 1);
  assert.equal(coursesOn(sameWeekdayMove.courses, 1, 1).length, 0);
  assert.equal(coursesOn(sameWeekdayMove.courses, 2, 1).length, 1);
  assert.deepEqual(
    sameWeekdayMove.courses.find((c) => c.id === "c-mon-math").weeks,
    [3, 4, 5, 6],
  );

  // planHolidaySwapDays: atomically swap Week 3 Mon (高等数学 A) <-> Week 3 Thu (数据结构)
  // Week 3 Mon = 2026-09-14, Week 3 Thu = 2026-09-17
  const swapRes = holiday.planHolidaySwapDays(
    schedule,
    "2026-09-14",
    "2026-09-17",
  );
  assert.equal(swapRes.swappedACount, 1);
  assert.equal(swapRes.swappedBCount, 1);
  assert.deepEqual(
    coursesOn(swapRes.courses, 3, 1).map((c) => c.name),
    ["数据结构"],
  );
  assert.deepEqual(
    coursesOn(swapRes.courses, 3, 4).map((c) => c.name),
    ["高等数学 A"],
  );
  // Non-target weeks untouched
  assert.deepEqual(
    swapRes.courses.find((c) => c.id === "c-mon-math").weeks,
    [1, 2, 4, 5, 6],
  );
  assert.deepEqual(
    swapRes.courses.find((c) => c.id === "c-thu-ds").weeks,
    [1, 2, 4],
  );
  // Original schedule must not have been mutated
  assert.deepEqual(schedule.courses[0].weeks, [1, 2, 3, 4, 5, 6]);

  /* ---------------- 2. scheduleExport tests ---------------- */
  const sharedPayloads = [];
  const writtenFiles = [];
  const exportMocks = {
    "react-native": {
      Platform: { OS: "ios" },
      Share: {
        share: async (content) => {
          sharedPayloads.push(content);
          return { action: "sharedAction" };
        },
      },
    },
    "expo-file-system": {
      Paths: { cache: "file:///mock-cache" },
      File: class MockFile {
        constructor(dir, name) {
          this.uri = `${dir}/${name}`;
        }
        create() {}
        async write(text) {
          writtenFiles.push({ uri: this.uri, text });
        }
      },
    },
  };
  const { load: loadExport } = createTsLoader(exportMocks);
  const exporter = loadExport("src/utils/scheduleExport.ts");

  // Test ICS output with mid-week endDate truncation (endDate 2026-10-01 = Week 5 Thu, so Week 5 Sun & Week 6 skipped!)
  const truncatedSchedule = {
    ...schedule,
    endDate: "2026-10-01",
  };
  const ics = exporter.exportScheduleToIcs(truncatedSchedule);

  // Strict CRLF check: every \n must be preceded by \r
  assert.equal(/(?<!\r)\n/.test(ics), false, "ICS must strictly use CRLF");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("PRODID:-//Dark Study//Timetable//ZH\r\n"));
  assert.ok(ics.includes("X-WR-CALNAME:2026 秋季学期\r\n"));
  assert.ok(ics.includes("TZID:Asia/Shanghai\r\n"));

  // Exact VEVENT count:
  // c-mon-math: weeks 1..5 = 5 (week 6 > 2026-10-01 skipped)
  // c-wed-math: weeks 1..5 = 5 (week 6 skipped)
  // c-wed-once: week 5 (2026-09-30) = 1
  // c-thu-ds: weeks 1..4 = 4
  // c-sun-lab: week 5 Sun = 2026-10-04 > 2026-10-01 skipped, week 6 skipped = 0
  // Total = 15 VEVENTs
  const veventMatches = ics.match(/BEGIN:VEVENT\r\n/g) || [];
  assert.equal(veventMatches.length, 15, "must skip occurrences past endDate");
  assert.ok(ics.includes("DTSTART;TZID=Asia/Shanghai:20260831T080000\r\n"));
  assert.ok(ics.includes("DTEND;TZID=Asia/Shanghai:20260831T094000\r\n"));
  assert.ok(ics.includes("DTSTART;TZID=Asia/Shanghai:20260930T140000\r\n"));
  assert.ok(ics.includes("DTEND;TZID=Asia/Shanghai:20260930T154000\r\n"));
  assert.ok(/UID:[^\r\n]+@darkstudy\.app\r\n/.test(ics));
  assert.ok(/DTSTAMP:\d{8}T\d{6}Z\r\n/.test(ics));
  // Verify comma, semicolon, newline escaping
  assert.ok(
    ics.includes("LOCATION:报告厅\\, 一层\\;东\r\n"),
    "must escape commas and semicolons in LOCATION",
  );
  assert.ok(
    ics.includes("备注：需签到\\n带校园卡\r\n"),
    "must escape newlines in DESCRIPTION",
  );

  // shareScheduleIcsFile on iOS
  const shareRes = await exporter.shareScheduleIcsFile(truncatedSchedule);
  assert.equal(shareRes.eventCount, 15);
  assert.ok(shareRes.uri.endsWith(".ics"));
  assert.equal(writtenFiles.length, 1);
  assert.equal(sharedPayloads[0].url, shareRes.uri);

  // formatScheduleTextSummary
  const week5Text = exporter.formatScheduleTextSummary(schedule, 5);
  assert.ok(week5Text.includes("第 5 周课表"));
  assert.ok(week5Text.includes("国庆前专题讲座"));
  assert.ok(!week5Text.includes("数据结构"), "数据结构 is only weeks 1-4");
  const allText = exporter.formatScheduleTextSummary(schedule);
  assert.ok(allText.includes("整学期课表"));
  assert.ok(allText.includes("数据结构"));

  // searchScheduleCourses
  assert.equal(exporter.searchScheduleCourses(schedule, "").length, 5);
  assert.equal(
    exporter.searchScheduleCourses(schedule, "高等数学").length,
    2,
  );
  assert.equal(
    exporter.searchScheduleCourses(schedule, "a305").length,
    1,
    "case-insensitive classroom match",
  );
  assert.equal(
    exporter.searchScheduleCourses(schedule, "期末闭卷").length,
    1,
    "note match",
  );
  assert.equal(
    exporter.searchScheduleCourses(schedule, "顾林 尚七").length,
    1,
    "multi-token match across teacher + classroom",
  );
  assert.equal(
    exporter.searchScheduleCourses(schedule, "不存在的课").length,
    0,
  );

  // computeScheduleStats
  const stats = exporter.computeScheduleStats(schedule);
  assert.equal(stats.uniqueCourseCount, 4, "高等数学 A Mon+Wed deduplicated");
  assert.equal(stats.slotCount, 5);
  assert.equal(stats.totalCredits, 12, "5 + 1 + 4 + 2 = 12 (no double count)");
  assert.equal(stats.totalSessions, 6 + 6 + 1 + 4 + 2);
  assert.equal(stats.weeklyHoursByWeekday.length, 7);
  // Wed has 6 + 1 = 7 sessions (each 100 min = 1.6667h) -> highest load!
  assert.equal(stats.busiestWeekday, 3);
  assert.deepEqual(stats.sessionsPerWeek, [3, 3, 3, 3, 4, 3]);

  const emptyStats = exporter.computeScheduleStats({
    ...schedule,
    courses: [],
  });
  assert.equal(emptyStats.uniqueCourseCount, 0);
  assert.equal(emptyStats.totalCredits, 0);
  assert.equal(emptyStats.totalSessions, 0);
  assert.equal(emptyStats.busiestWeekday, null);

  /* ---------------- 3. systemCourseReminders iOS & Web tests ---------------- */
  let iosGranted = true;
  let iosDefaultThrows = false;
  const iosCalendars = [];
  const iosEvents = [];
  const createdCalDetails = [];
  const iosMockCalendar = {
    EntityTypes: { EVENT: "event", REMINDER: "reminder" },
    CalendarAccessLevel: { OWNER: "owner" },
    SourceType: {
      LOCAL: "local",
      CALDAV: "caldav",
      SUBSCRIBED: "subscribed",
      BIRTHDAYS: "birthdays",
    },
    requestCalendarPermissionsAsync: async () => ({ granted: iosGranted }),
    getCalendarsAsync: async () => iosCalendars,
    getDefaultCalendarAsync: async () => {
      if (iosDefaultThrows) throw new Error("no default calendar");
      return {
        id: "ios-default",
        title: "日历",
        allowsModifications: true,
        source: { id: "src-icloud", name: "iCloud", type: "caldav" },
      };
    },
    getSourcesAsync: async () => [
      { id: "src-sub", name: "节假日", type: "subscribed" },
      { id: "src-local", name: "Default", type: "local" },
    ],
    createCalendarAsync: async (details) => {
      createdCalDetails.push(details);
      const id = `ios-cal-${iosCalendars.length + 1}`;
      // Real iOS Calendar objects identify by title, not Android's name field
      iosCalendars.push({
        id,
        title: details.title,
        allowsModifications: true,
        source: details.source,
      });
      return id;
    },
    getEventsAsync: async (_ids, start, end) =>
      iosEvents.filter((e) => +e.startDate < +end && +e.endDate > +start),
    createEventAsync: async (calendarId, details) => {
      const id = `ev-${iosEvents.length + 1}`;
      iosEvents.push({ id, calendarId, ...details });
      return id;
    },
    updateEventAsync: async (id, details) => {
      const target = iosEvents.find((e) => e.id === id);
      Object.assign(target, details);
      return id;
    },
    deleteEventAsync: async (id) => {
      const idx = iosEvents.findIndex((e) => e.id === id);
      if (idx >= 0) iosEvents.splice(idx, 1);
    },
  };

  const { load: loadIosRem } = createTsLoader({
    "react-native": { Platform: { OS: "ios" } },
    "expo-calendar/legacy": iosMockCalendar,
    "expo-intent-launcher": {
      startActivityAsync: async () => {
        throw new Error("Should not call Android IntentLauncher on iOS");
      },
    },
  });
  const iosReminders = loadIosRem("src/services/systemCourseReminders.ts");

  const now = Date.now();
  const c1 = {
    id: "ios-c1",
    name: "机器学习",
    teacher: "周雪",
    classroom: "实验楼 A305",
    start: now + 3600000,
    end: now + 7200000,
  };
  const cPast = {
    id: "ios-past",
    name: "已结束课程",
    teacher: "",
    classroom: "",
    start: now - 3600000,
    end: now - 1000,
  };

  // Permission denied on iOS
  iosGranted = false;
  await assert.rejects(
    iosReminders.importCourseCalendar([c1], 15, "term-ios"),
    /权限/,
  );
  assert.equal(iosCalendars.length, 0);

  // Permission granted -> creates Dark Study calendar using iCloud default source
  iosGranted = true;
  const iosRes1 = await iosReminders.importCourseCalendar(
    [c1, cPast],
    15,
    "term-ios",
  );
  assert.deepEqual(iosRes1, { completed: 1, skipped: 1, failures: [] });
  assert.equal(iosCalendars.length, 1);
  assert.equal(createdCalDetails[0].title, "Dark Study 课程");
  assert.equal(createdCalDetails[0].entityType, "event");
  assert.equal(createdCalDetails[0].source.id, "src-icloud");
  assert.equal(iosEvents.length, 1);

  // Re-import updates in place without creating duplicate calendar or event
  const iosRes2 = await iosReminders.importCourseCalendar([c1], 25, "term-ios");
  assert.equal(iosRes2.completed, 1);
  assert.equal(iosCalendars.length, 1, "reuses existing iOS calendar by title");
  assert.equal(iosEvents.length, 1, "updates existing event idempotently");
  assert.equal(iosEvents[0].alarms[0].relativeOffset, -25);

  // Add another schedule and selectively clear term-ios
  await iosReminders.importCourseCalendar([c1], 15, "term-other");
  assert.equal(iosEvents.length, 2);
  const removedIos = await iosReminders.clearCourseCalendar("term-ios");
  assert.equal(removedIos, 1);
  assert.equal(iosEvents.length, 1, "other schedule remains on iOS");

  // Fallback to getSourcesAsync when getDefaultCalendarAsync fails and no existing calendars
  iosCalendars.length = 0;
  iosDefaultThrows = true;
  const iosResFallback = await iosReminders.importCourseCalendar(
    [c1],
    10,
    "term-fallback",
  );
  assert.equal(iosResFallback.completed, 1);
  assert.equal(
    createdCalDetails[createdCalDetails.length - 1].source.id,
    "src-local",
  );

  // Web platform throws clear .ics hint
  const { load: loadWebRem } = createTsLoader({
    "react-native": { Platform: { OS: "web" } },
    "expo-calendar/legacy": iosMockCalendar,
    "expo-intent-launcher": { startActivityAsync: async () => {} },
  });
  const webReminders = loadWebRem("src/services/systemCourseReminders.ts");
  await assert.rejects(
    webReminders.importCourseCalendar([c1], 15, "term-web"),
    /网页端不支持写入系统日历，可使用 \.ics 导出功能/,
  );
  await assert.rejects(
    webReminders.clearCourseCalendar("term-web"),
    /网页端不支持写入系统日历，可使用 \.ics 导出功能/,
  );

  console.log(
    "PASS: holidayShift (cancel/move/swap), scheduleExport (.ics CRLF/escaping/truncation, search, stats, share), and iOS/Web systemCourseReminders",
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

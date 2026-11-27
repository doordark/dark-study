const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

const PERIODS = [
  { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
  { index: 3, label: "第3节", startTime: "10:00", endTime: "10:45" },
  { index: 4, label: "第4节", startTime: "10:55", endTime: "11:40" },
  { index: 5, label: "第5节", startTime: "14:00", endTime: "14:45" },
  { index: 6, label: "第6节", startTime: "14:55", endTime: "15:40" },
  { index: 7, label: "第7节", startTime: "16:00", endTime: "16:45" },
  { index: 8, label: "第8节", startTime: "16:55", endTime: "17:40" },
];

function createTestEnv() {
  return createLoader({
    "rn-mlkit-ocr": {
      recognizeText: async () => ({ blocks: [] }),
    },
    "react-native": {
      Platform: { OS: "ios" },
      Share: { share: async () => ({ action: "sharedAction" }) },
    },
    "expo-document-picker": {},
    "expo-file-system": {},
    "expo-image-picker": {},
  });
}

function makeRoundtripSchedule() {
  return {
    id: "term-2026-fall",
    name: "2026 秋季学期",
    kind: "fall",
    startDate: "2026-08-31", // Monday (Week 1)
    endDate: "2026-10-11", // Sunday (Week 6)
    totalWeeks: 6,
    periods: PERIODS,
    courses: [
      {
        id: "c-math-mon",
        name: "高等数学 A",
        teacher: "胡柏遇",
        classroom: "新教楼 201",
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3, 4, 5, 6],
        color: "violet",
        credits: 5,
        note: "带练习册",
      },
      {
        id: "c-math-wed",
        name: "高等数学 A",
        teacher: "胡柏遇",
        classroom: "新教楼 201",
        weekday: 3,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 3, 5],
        color: "violet",
        credits: 5,
      },
      {
        id: "c-lecture",
        name: "专题讲座, 前沿;导论",
        teacher: "林教授",
        classroom: "报告厅, 一层;东",
        weekday: 3,
        startPeriod: 5,
        endPeriod: 6,
        weeks: [5],
        color: "amber",
        credits: 1.5,
        note: "需签到\n带校园卡",
      },
      {
        id: "c-lab-sun",
        name: "开放实验课",
        teacher: "周雪",
        classroom: "实验楼 A305",
        weekday: 7,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [2, 4, 6],
        color: "emerald",
        credits: 2,
      },
    ],
  };
}

async function testRoundtripDarkStudyIcs() {
  const load = createTestEnv();
  const exporter = load("src/utils/scheduleExport.ts");
  const docParser = load("src/utils/documentParser.ts");
  const offlineImport = load("src/services/offlineImport.ts");

  const original = makeRoundtripSchedule();
  const ics = exporter.exportScheduleToIcs(original);

  // 1) Direct parseIcsSchedule with matching context
  const parsedDirect = docParser.parseIcsSchedule(ics, {
    startDate: original.startDate,
    totalWeeks: original.totalWeeks,
    periods: PERIODS,
  });
  assert.equal(parsedDirect.length, 4);

  const mathMon = parsedDirect.find(
    (c) => c.name === "高等数学 A" && c.weekday === 1,
  );
  assert(mathMon, "Monday 高等数学 A must roundtrip");
  assert.equal(mathMon.teacher, "胡柏遇");
  assert.equal(mathMon.classroom, "新教楼 201");
  assert.equal(mathMon.startPeriod, 1);
  assert.equal(mathMon.endPeriod, 2);
  assert.deepEqual(mathMon.weeks, [1, 2, 3, 4, 5, 6]);
  assert.equal(mathMon.credits, 5);
  assert.equal(mathMon.note, "带练习册");

  const mathWed = parsedDirect.find(
    (c) => c.name === "高等数学 A" && c.weekday === 3,
  );
  assert(mathWed, "Wednesday 高等数学 A must roundtrip");
  assert.deepEqual(mathWed.weeks, [1, 3, 5]);

  const lecture = parsedDirect.find((c) => c.weekday === 3 && c.startPeriod === 5);
  assert(lecture, "Escaped lecture must roundtrip");
  assert.equal(lecture.name, "专题讲座, 前沿;导论");
  assert.equal(lecture.classroom, "报告厅, 一层;东");
  assert.equal(lecture.teacher, "林教授");
  assert.equal(lecture.endPeriod, 6);
  assert.deepEqual(lecture.weeks, [5]);
  assert.equal(lecture.credits, 1.5);
  assert.equal(lecture.note, "需签到\n带校园卡");

  const labSun = parsedDirect.find((c) => c.name === "开放实验课");
  assert(labSun, "Sunday lab must roundtrip");
  assert.equal(labSun.weekday, 7);
  assert.equal(labSun.startPeriod, 3);
  assert.equal(labSun.endPeriod, 4);
  assert.deepEqual(labSun.weeks, [2, 4, 6]);

  // 2) Full recognizeScheduleFromTextOffline WITHOUT passing startDate ctx (auto-anchor via 第N周 + X-WR-CALNAME!)
  const importedSchedule = offlineImport.recognizeScheduleFromTextOffline(ics, {
    periods: PERIODS,
  });
  assert.equal(importedSchedule.name, "2026 秋季学期");
  assert.equal(importedSchedule.startDate, "2026-08-31");
  assert.equal(importedSchedule.courses.length, 4);
  assert.deepEqual(
    importedSchedule.courses.find((c) => c.name === "专题讲座, 前沿;导论").weeks,
    [5],
  );

  // 3) Cross-semester safety: even if active schedule context is from a completely different semester,
  // auto-anchoring still imports all courses cleanly instead of dropping everything!
  const crossSemester = offlineImport.recognizeScheduleFromTextOffline(ics, {
    startDate: "2025-02-24",
    totalWeeks: 18,
    periods: PERIODS,
  });
  assert.equal(crossSemester.startDate, "2026-08-31");
  assert.equal(crossSemester.courses.length, 4);
}

async function testExternalRfc5545Ics() {
  const load = createTestEnv();
  const offlineImport = load("src/services/offlineImport.ts");
  const fileImport = load("src/services/fileImport.ts");

  // External RFC 5545 calendar featuring:
  // - UTF-8 BOM + CRLF + folded lines (both space and tab continuations)
  // - VTIMEZONE + Asia/Shanghai (+0800) + UTC 'Z' timestamps
  // - RRULE:FREQ=WEEKLY with COUNT, INTERVAL=2 + BYDAY + UNTIL
  // - EXDATE holiday cancellation + RDATE makeup class
  // - DURATION without DTEND
  // - Nested BEGIN:VALARM with its own DESCRIPTION (must NOT clobber VEVENT DESCRIPTION!)
  // - Escaped \n, \,, \;, \\, and literal \\n
  // - All-day event (VALUE=DATE) ignored cleanly
  const externalIcs = [
    "\uFEFFBEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//External University//Calendar//EN",
    "X-WR-CALNAME:2026\\, 春季外校课表",
    "X-WR-TIMEZONE:Asia/Shanghai",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "END:STANDARD",
    "END:VTIMEZONE",
    // Event 1: Weekly COUNT=4 on Mondays starting 2026-03-02 (Week 1), with EXDATE on Week 3 (2026-03-16) and RDATE on Week 6 (2026-04-06)
    "BEGIN:VEVENT",
    "UID:ext-1@uni.edu",
    "DTSTART;TZID=Asia/Shanghai:20260302T080000",
    "DTEND;TZID=Asia/Shanghai:20260302T094000",
    "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=4",
    "EXDATE;TZID=Asia/Shanghai:20260316T080000",
    "RDATE;TZID=Asia/Shanghai:20260406T080000",
    "SUMMARY:计算机组成",
    " 原理",
    "LOCATION:信息楼\\, B202\\;西",
    "DESCRIPTION:任课教师：王教授\\n课程号：CS201\\n路径：C:\\\\lab\\\\note\\n备注：带实验手册\\\\n第二行",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Alarm Reminder Should Not Overwrite Teacher",
    "DURATION:PT5M",
    "END:VALARM",
    "END:VEVENT",
    // Event 2: UTC 'Z' timestamp (02:00Z = 10:00 +0800 -> Period 3) + DURATION:PT1H40M (ends 11:40 -> Period 4)
    // Biweekly (INTERVAL=2) on Tue & Thu until 2026-03-31 -> Week 1 (Tue/Thu), Week 3 (Tue/Thu), Week 5 (Tue 3/31 only, Thu 4/2 > UNTIL!)
    "BEGIN:VEVENT",
    "UID:ext-2@uni.edu",
    "DTSTART:20260303T020000Z",
    "DURATION:PT1H40M",
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,TU;UNTIL=20260331T155959Z",
    "SUMMARY:Algorithm",
    "\t Design",
    "LOCATION:Science Hall 305",
    "DESCRIPTION:Teacher: Prof. Lin\\nCredits: 3.5",
    "END:VEVENT",
    // Event 3: All-day holiday marker (should be ignored cleanly)
    "BEGIN:VEVENT",
    "UID:holiday-1@uni.edu",
    "DTSTART;VALUE=DATE:20260308",
    "DTEND;VALUE=DATE:20260309",
    "SUMMARY:校庆纪念日",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const schedule = offlineImport.recognizeScheduleFromTextOffline(externalIcs, {
    startDate: "2026-03-02",
    totalWeeks: 16,
    periods: PERIODS,
  });

  assert.equal(schedule.name, "2026, 春季外校课表");
  assert.equal(schedule.courses.length, 3, "Mon CS + Tue Algo + Thu Algo (all-day ignored)");

  const cs = schedule.courses.find((c) => c.name === "计算机组成原理");
  assert(cs, "Folded SUMMARY must unfold without extra spaces");
  assert.equal(cs.classroom, "信息楼, B202;西");
  assert.equal(cs.teacher, "王教授", "VALARM DESCRIPTION must not overwrite VEVENT teacher");
  assert.equal(cs.weekday, 1);
  assert.equal(cs.startPeriod, 1);
  assert.equal(cs.endPeriod, 2);
  // COUNT=4 -> [1,2,3,4], EXDATE removes 3 -> [1,2,4], RDATE adds 6 -> [1,2,4,6]
  assert.deepEqual(cs.weeks, [1, 2, 4, 6]);
  assert.equal(cs.note, "带实验手册\\n第二行", "Single-pass unescape preserves literal \\\\n as \\n");

  const algoTue = schedule.courses.find(
    (c) => c.name === "Algorithm Design" && c.weekday === 2,
  );
  assert(algoTue, "Tab-folded SUMMARY & UTC Z -> Asia/Shanghai +0800 must resolve");
  assert.equal(algoTue.teacher, "Prof. Lin");
  assert.equal(algoTue.classroom, "Science Hall 305");
  assert.equal(algoTue.startPeriod, 3);
  assert.equal(algoTue.endPeriod, 4);
  assert.equal(algoTue.credits, 3.5);
  assert.deepEqual(algoTue.weeks, [1, 3, 5]);

  const algoThu = schedule.courses.find(
    (c) => c.name === "Algorithm Design" && c.weekday === 4,
  );
  assert(algoThu, "BYDAY=TH,TU must expand Thursday occurrences too");
  assert.deepEqual(algoThu.weeks, [1, 3], "Week 5 Thu (2026-04-02) is after UNTIL 2026-03-31");

  // Unbounded RRULE:FREQ=WEEKLY without COUNT/UNTIL & without ctx.startDate caps sensibly at default 18 weeks
  const unboundedIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART;TZID=Asia/Shanghai:20260907T080000",
    "DTEND;TZID=Asia/Shanghai:20260907T094000",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:英语听说",
    "LOCATION:外语楼 102",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const unboundedRes = offlineImport.recognizeScheduleFromTextOffline(
    unboundedIcs,
    { periods: PERIODS },
  );
  assert.equal(unboundedRes.totalWeeks, 18);
  assert.equal(unboundedRes.courses.length, 1);
  assert.equal(unboundedRes.courses[0].weeks.length, 18);

  // fileImport.detectFormat coverage for calendar MIME types & extensions
  assert.equal(fileImport.detectFormat("ics"), "ics");
  assert.equal(fileImport.detectFormat("ical"), "ics");
  assert.equal(fileImport.detectFormat("", "text/calendar; charset=utf-8"), "ics");
  assert.equal(fileImport.detectFormat("", "application/ics"), "ics");
  assert.equal(fileImport.detectFormat("", "text/x-vcalendar"), "ics");
}

async function run() {
  await testRoundtripDarkStudyIcs();
  await testExternalRfc5545Ics();
  console.log(
    "PASS: Dark Study .ics export -> offline import roundtrip (escaping, notes, credits, auto-anchor) and external RFC 5545 .ics (RRULE COUNT/UNTIL/INTERVAL/BYDAY, EXDATE/RDATE, VTIMEZONE/UTC Z, DURATION, VALARM isolation, line unfolding, MIME detection) verified",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

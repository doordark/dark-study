const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function createLoader({ platformOs = "android", notificationsMock = null } = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, "..", relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const target = new Module(filename, module);
    cache.set(filename, target);
    target.require = (request) => {
      if (request === "react-native") {
        return { Platform: { OS: platformOs } };
      }
      if (request === "expo-notifications" && notificationsMock) {
        return notificationsMock;
      }
      if (request.startsWith("@/")) {
        const base = `src/${request.slice(2)}`;
        if (fs.existsSync(path.resolve(__dirname, "..", `${base}.ts`))) return load(`${base}.ts`);
        if (fs.existsSync(path.resolve(__dirname, "..", `${base}/index.ts`))) return load(`${base}/index.ts`);
      }
      if (request.endsWith(".json")) {
        return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), request), "utf8"));
      }
      return require(request);
    };
    target._compile(compiled.outputText, filename);
    return target.exports;
  }
  return load;
}

async function run() {
  const loadDefault = createLoader();
  const { WIDGET_DISPLAY_MODES, weekWidgetDays } = loadDefault("src/utils/courseWidget.ts");

  // 1. WIDGET_DISPLAY_MODES includes "week"
  const modeKeys = WIDGET_DISPLAY_MODES.map((m) => m.key);
  assert.deepEqual(modeKeys, ["upcoming", "today", "week"], "WIDGET_DISPLAY_MODES exposes upcoming/today/week");
  const weekModeMeta = WIDGET_DISPLAY_MODES.find((m) => m.key === "week");
  assert.equal(weekModeMeta.label, "本周一览");
  assert(weekModeMeta.desc.includes("周一至周日"), "week mode describes Mon-Sun overview");

  // 2. weekWidgetDays accuracy
  const schedule = {
    id: "term-2026",
    name: "2026 秋季",
    kind: "fall",
    startDate: "2026-11-02", // Monday (Week 1)
    endDate: "2026-11-15",   // Sunday (Week 2)
    totalWeeks: 2,
    periods: [
      { index: 1, label: "1节", startTime: "08:00", endTime: "08:45" },
      { index: 2, label: "2节", startTime: "09:00", endTime: "09:45" },
      { index: 3, label: "3节", startTime: "10:05", endTime: "10:50" },
      { index: 4, label: "4节", startTime: "11:00", endTime: "11:45" },
      { index: 5, label: "5节", startTime: "14:00", endTime: "15:45" },
    ],
    courses: [
      {
        id: "c-lin",
        name: "线性代数",
        teacher: "王老师",
        classroom: "教二-104",
        weekday: 1,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [1, 2],
        color: "violet",
      },
      {
        id: "c-math",
        name: "高等数学",
        teacher: "林教授",
        classroom: "教三-201",
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 1],
        color: "sky",
      },
      {
        id: "c-algo",
        name: "数据结构",
        teacher: "陈老师",
        classroom: "",
        weekday: 3,
        startPeriod: 5,
        endPeriod: 5,
        weeks: [1],
        color: "emerald",
      },
      {
        id: "c-week2-only",
        name: "软件工程",
        teacher: "刘老师",
        classroom: "信息A201",
        weekday: 2,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [2],
        color: "amber",
      },
      {
        id: "c-sun",
        name: "创新研讨",
        teacher: "赵老师",
        classroom: "博学301",
        weekday: 7,
        startPeriod: 1,
        endPeriod: 2,
        startTime: "09:30",
        endTime: "11:00",
        weeks: [1],
        color: "rose",
      },
    ],
  };

  assert.deepEqual(weekWidgetDays(undefined, new Date("2026-11-04T09:00:00")), [], "undefined schedule yields []");

  const wedWeek1 = weekWidgetDays(schedule, new Date("2026-11-04T09:00:00")); // Wednesday, week 1
  assert.equal(wedWeek1.length, 7, "returns all 7 weekdays Mon..Sun");
  assert.deepEqual(
    wedWeek1.map((d) => d.dayLabel),
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  );
  assert.deepEqual(
    wedWeek1.map((d) => d.isToday),
    [false, false, true, false, false, false, false],
    "Wednesday marked isToday",
  );
  assert.deepEqual(
    wedWeek1[0].courses.map((c) => [c.id, c.name, c.startTime, c.classroom, c.color]),
    [
      ["c-math", "高等数学", "08:00", "教三-201", "sky"],
      ["c-lin", "线性代数", "10:05", "教二-104", "violet"],
    ],
    "Monday courses sorted by startTime and deduplicated",
  );
  assert.equal(wedWeek1[1].courses.length, 0, "week-2-only course excluded in week 1");
  assert.equal(wedWeek1[2].courses.length, 1, "Wednesday has 1 course in week 1");
  assert.equal(wedWeek1[2].courses[0].id, "c-algo");
  assert.equal(wedWeek1[6].courses.length, 1, "Sunday uses custom startTime override");
  assert.equal(wedWeek1[6].courses[0].startTime, "09:30");

  // Sunday isToday check (getDay() === 0 -> weekday 7)
  const sunWeek1 = weekWidgetDays(schedule, new Date("2026-11-08T10:00:00"));
  assert.equal(sunWeek1[6].isToday, true, "Sunday maps to weekday 7 isToday");
  assert.equal(sunWeek1[0].isToday, false);

  // Out-of-semester returns 7 days with empty courses
  const afterTerm = weekWidgetDays(schedule, new Date("2026-11-20T10:00:00"));
  assert.equal(afterTerm.length, 7);
  assert(afterTerm.every((d) => d.courses.length === 0), "after semester yields empty week days");

  // 3. Kotlin CourseWidget.kt checks (week mode + per-course deep link + native parity)
  const pluginKt = fs.readFileSync(path.resolve(__dirname, "..", "plugins/course-widget/CourseWidget.kt"), "utf8");
  const androidKt = fs.readFileSync(
    path.resolve(__dirname, "..", "android/app/src/main/java/com/darkstudy/app/CourseWidget.kt"),
    "utf8",
  );
  for (const [label, kt] of [
    ["plugins/course-widget/CourseWidget.kt", pluginKt],
    ["android/.../CourseWidget.kt", androidKt],
  ]) {
    assert(kt.includes('setOf("upcoming", "today", "week")'), `${label} accepts week displayMode`);
    assert(kt.includes("val courseId: String") && kt.includes("val week: Int"), `${label} Lesson carries courseId & week`);
    assert(kt.includes("fun weekLessons("), `${label} computes active week lessons`);
    assert(
      kt.includes('dark-study://?courseId=${Uri.encode(lesson.courseId)}&week=${lesson.week}'),
      `${label} builds per-course dark-study://?courseId=...&week=... deep link`,
    );
    assert(kt.includes("Intent.ACTION_VIEW"), `${label} uses ACTION_VIEW for deep link`);
    assert(kt.includes("setPackage(context.packageName)"), `${label} scopes deep link to app package`);
    assert(
      kt.includes("setOnClickPendingIntent(R.id.widget_course_row"),
      `${label} attaches click PendingIntent per course row`,
    );
    assert(
      kt.includes('Uri.parse("dark-study:///")'),
      `${label} keeps root deep link on background`,
    );
  }

  // CourseWidgetSettings preview & CourseReminderSync wiring checks
  const widgetSettingsSrc = fs.readFileSync(
    path.resolve(__dirname, "..", "src/components/CourseWidgetSettings.tsx"),
    "utf8",
  );
  assert(widgetSettingsSrc.includes("weekWidgetDays"), "CourseWidgetSettings imports/uses weekWidgetDays");
  assert(widgetSettingsSrc.includes('mode === "week"'), "CourseWidgetSettings renders week mode preview");

  const reminderSyncSrc = fs.readFileSync(
    path.resolve(__dirname, "..", "src/components/CourseReminderSync.tsx"),
    "utf8",
  );
  assert(reminderSyncSrc.includes("liveClassNotification"), "CourseReminderSync subscribes to liveClassNotification");
  assert(reminderSyncSrc.includes("syncLiveClassNotification"), "CourseReminderSync invokes syncLiveClassNotification");
  assert(reminderSyncSrc.includes("60_000") || reminderSyncSrc.includes("60000"), "CourseReminderSync runs 60s foreground interval");

  // 4. buildLiveClassBanner pure state tests
  const events = [];
  let permissionGranted = true;
  const mockNotifications = {
    AndroidImportance: { LOW: 4, DEFAULT: 5, HIGH: 6 },
    getPermissionsAsync: async () => ({ granted: permissionGranted }),
    setNotificationChannelAsync: async (id, config) => {
      events.push({ op: "channel", id, config });
    },
    scheduleNotificationAsync: async (req) => {
      events.push({ op: "schedule", req });
      return req.identifier || "generated";
    },
    dismissNotificationAsync: async (id) => {
      events.push({ op: "dismiss", id });
    },
  };

  const loadAndroid = createLoader({ platformOs: "android", notificationsMock: mockNotifications });
  const {
    buildLiveClassBanner,
    syncLiveClassNotification,
    LIVE_CLASS_CHANNEL_ID,
    LIVE_CLASS_NOTIFICATION_ID,
    LIVE_CLASS_NOTIFICATION_KIND,
  } = loadAndroid("src/services/liveClassNotification.ts");

  // Idle when undefined or far from class
  const idleNone = buildLiveClassBanner(undefined, new Date("2026-11-02T07:50:00"), 15);
  assert.equal(idleNone.active, false);
  assert.equal(idleNone.phase, "idle");
  assert.equal(idleNone.nextRefreshAt, null);

  const idleFar = buildLiveClassBanner(schedule, new Date("2026-11-02T07:44:00"), 15);
  assert.equal(idleFar.active, false);
  assert.equal(idleFar.phase, "idle");
  assert.equal(idleFar.nextRefreshAt, null);

  // Upcoming within preMinutes (15 min boundary & 10 min prior)
  const up15 = buildLiveClassBanner(schedule, new Date("2026-11-02T07:45:00"), 15);
  assert.equal(up15.active, true);
  assert.equal(up15.phase, "upcoming");
  assert.equal(up15.courseId, "c-math");
  assert.equal(up15.week, 1);
  assert.equal(up15.remainingMinutes, 15);
  assert.equal(up15.title, "即将上课 · 高等数学");
  assert.equal(up15.body, "15 分钟后开始 · 教三-201");
  assert.equal(up15.nextRefreshAt, new Date("2026-11-02T07:46:00").getTime());

  // Upcoming without classroom (Wednesday c-algo at 14:00, 10 min before)
  const upNoRoom = buildLiveClassBanner(schedule, new Date("2026-11-04T13:50:00"), 15);
  assert.equal(upNoRoom.active, true);
  assert.equal(upNoRoom.phase, "upcoming");
  assert.equal(upNoRoom.courseId, "c-algo");
  assert.equal(upNoRoom.remainingMinutes, 10);
  assert.equal(upNoRoom.body, "10 分钟后开始");

  // Ongoing at start boundary (08:00:00 of 08:00-09:45 = 105 min)
  const onStart = buildLiveClassBanner(schedule, new Date("2026-11-02T08:00:00"), 15);
  assert.equal(onStart.active, true);
  assert.equal(onStart.phase, "ongoing");
  assert.equal(onStart.courseId, "c-math");
  assert.equal(onStart.progressPct, 0);
  assert.equal(onStart.remainingMinutes, 105);
  assert.equal(onStart.title, "正在上课 · 高等数学");
  assert.equal(onStart.body, "教三-201 · 距下课 105 分钟（进度 0%）");

  // Ongoing midway (08:52:30 -> 52.5 / 105 = 50%, remaining 52.5 -> ceil 53 min)
  const onMid = buildLiveClassBanner(schedule, new Date("2026-11-02T08:52:30"), 15);
  assert.equal(onMid.active, true);
  assert.equal(onMid.phase, "ongoing");
  assert.equal(onMid.progressPct, 50);
  assert.equal(onMid.remainingMinutes, 53);
  assert.equal(onMid.body, "教三-201 · 距下课 53 分钟（进度 50%）");
  assert.equal(onMid.nextRefreshAt, new Date("2026-11-02T08:53:00").getTime());

  // Ongoing without classroom near end (15:44:40 of 14:00-15:45 -> nextRefreshAt capped at end)
  const onEndSoon = buildLiveClassBanner(schedule, new Date("2026-11-04T15:44:40"), 15);
  assert.equal(onEndSoon.active, true);
  assert.equal(onEndSoon.phase, "ongoing");
  assert.equal(onEndSoon.remainingMinutes, 1);
  assert.equal(onEndSoon.nextRefreshAt, new Date("2026-11-04T15:45:00").getTime());
  assert(onEndSoon.body.startsWith("距下课 1 分钟"), "empty classroom omits leading separator");

  // At exact end boundary -> idle (next course is at 10:05, 20 min away > 15)
  const atEnd = buildLiveClassBanner(schedule, new Date("2026-11-02T09:45:00"), 15);
  assert.equal(atEnd.active, false);
  assert.equal(atEnd.phase, "idle");

  // 5. syncLiveClassNotification present / update / dismiss lifecycle
  events.length = 0;
  await syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T08:52:30"));
  assert.equal(events.length, 2, "prepares channel and presents ongoing notification");
  assert.equal(events[0].op, "channel");
  assert.equal(events[0].id, LIVE_CLASS_CHANNEL_ID);
  assert.equal(events[0].id, "course-live-status");
  assert.equal(events[0].config.importance, mockNotifications.AndroidImportance.LOW);
  assert.equal(events[0].config.sound, null);
  assert.equal(events[0].config.enableVibrate, false);
  assert.equal(events[1].op, "schedule");
  assert.equal(events[1].req.identifier, LIVE_CLASS_NOTIFICATION_ID);
  assert.equal(events[1].req.identifier, "dark-study-live-class");
  assert.equal(events[1].req.content.sticky, true);
  assert.equal(events[1].req.content.sound, false);
  assert.equal(events[1].req.content.title, "正在上课 · 高等数学");
  assert.deepEqual(events[1].req.content.data, {
    kind: LIVE_CLASS_NOTIFICATION_KIND,
    courseId: "c-math",
    week: 1,
  });
  assert.deepEqual(events[1].req.trigger, { channelId: "course-live-status" });

  // Upcoming presentation
  events.length = 0;
  await syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T07:50:00"));
  assert.equal(events[1].op, "schedule");
  assert.equal(events[1].req.identifier, "dark-study-live-class");
  assert.equal(events[1].req.content.title, "即将上课 · 高等数学");
  assert.equal(events[1].req.content.body, "10 分钟后开始 · 教三-201");

  // Idle dismisses deterministic notification
  events.length = 0;
  await syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T12:30:00"));
  assert.deepEqual(events, [{ op: "dismiss", id: "dark-study-live-class" }]);

  // Disabled dismisses even during ongoing class
  events.length = 0;
  await syncLiveClassNotification(schedule, false, 15, new Date("2026-11-02T08:52:30"));
  assert.deepEqual(events, [{ op: "dismiss", id: "dark-study-live-class" }]);

  // Denied permission skips present and dismisses stale notification
  events.length = 0;
  permissionGranted = false;
  await syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T08:52:30"));
  assert.deepEqual(events, [{ op: "dismiss", id: "dark-study-live-class" }]);
  permissionGranted = true;

  // iOS presents with trigger: null and skips Android channel creation
  const iosEvents = [];
  const loadIos = createLoader({
    platformOs: "ios",
    notificationsMock: {
      ...mockNotifications,
      setNotificationChannelAsync: async () => iosEvents.push({ op: "channel" }),
      scheduleNotificationAsync: async (req) => iosEvents.push({ op: "schedule", req }),
      dismissNotificationAsync: async (id) => iosEvents.push({ op: "dismiss", id }),
    },
  });
  const iosSvc = loadIos("src/services/liveClassNotification.ts");
  await iosSvc.syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T08:52:30"));
  assert.equal(iosEvents.length, 1, "iOS skips Android channel creation");
  assert.equal(iosEvents[0].op, "schedule");
  assert.equal(iosEvents[0].req.trigger, null, "iOS immediate notification uses null trigger");
  assert.equal(iosEvents[0].req.content.interruptionLevel, "passive");

  // Web is a complete no-op
  const webEvents = [];
  const loadWeb = createLoader({
    platformOs: "web",
    notificationsMock: {
      ...mockNotifications,
      setNotificationChannelAsync: async () => webEvents.push("channel"),
      scheduleNotificationAsync: async () => webEvents.push("schedule"),
      dismissNotificationAsync: async () => webEvents.push("dismiss"),
    },
  });
  const webSvc = loadWeb("src/services/liveClassNotification.ts");
  await webSvc.syncLiveClassNotification(schedule, true, 15, new Date("2026-11-02T08:52:30"));
  assert.equal(webEvents.length, 0, "web syncLiveClassNotification is a no-op");

  console.log("PASS: widget week overview, per-course deep links, and live class notification checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

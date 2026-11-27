const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

async function run() {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      disk.set(key, value);
    },
    removeItem: async (key) => {
      disk.delete(key);
    },
  };

  const notifications = {
    existing: [],
    scheduled: [],
    cancelled: [],
    granted: true,
  };

  let aiCalls = [];
  const load = createLoader({
    "react-native": { Platform: { OS: "android" } },
    "@react-native-async-storage/async-storage": storage,
    "expo-notifications": {
      setNotificationHandler() {},
      AndroidImportance: { HIGH: 4 },
      SchedulableTriggerInputTypes: { DATE: "date" },
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: notifications.granted, canAskAgain: false }),
      requestPermissionsAsync: async () => ({ granted: notifications.granted }),
      getAllScheduledNotificationsAsync: async () => notifications.existing,
      scheduleNotificationAsync: async (req) => {
        notifications.scheduled.push(req);
        return `id-${notifications.scheduled.length}`;
      },
      cancelScheduledNotificationAsync: async (id) => {
        notifications.cancelled.push(id);
      },
    },
    "@/services/offlineImport": {},
    "@/services/deepseek": {
      TEXT_MODEL: "mock-text",
      VISION_MODEL: "mock-vision",
      chatJson: async (messages) => {
        aiCalls.push(messages);
        return { reply: "记得复习高数哦", actions: [] };
      },
    },
  });

  /* 1. CourseTask model normalization, exam fields & countdown formatting */
  const tasksMod = load("src/utils/courseTasks.ts");
  const baseNow = new Date(2026, 5, 10, 10, 0, 0, 0).getTime(); // 2026-06-10 10:00

  const legacyNormalized = tasksMod.normalizeCourseTasks([
    {
      id: "legacy-1",
      title: " 旧版作业 ",
      type: "homework",
      dueAt: baseNow + 3_600_000,
      reminder: 15,
    },
  ]);
  assert.equal(legacyNormalized.length, 1);
  assert.equal(legacyNormalized[0].title, "旧版作业");
  assert.equal("location" in legacyNormalized[0], false);
  assert.equal("examMode" in legacyNormalized[0], false);

  const examNormalized = tasksMod.normalizeCourseTasks([
    {
      id: "exam-1",
      title: "高数期末",
      type: "exam",
      dueAt: baseNow + 2 * 86_400_000,
      reminder: 1440,
      course: { scheduleId: "s1", courseId: "c1", courseName: "高等数学" },
      location: " 教三-201 ",
      seat: " 15号 ",
      examMode: "closed",
      note: " 带学生证和黑色签字笔 ",
    },
    {
      id: "exam-blank-opt",
      title: "线代期中",
      type: "exam",
      dueAt: baseNow + 86_400_000,
      reminder: 60,
      location: "   ",
      seat: "",
      note: "  ",
    },
    // Invalid rows must be dropped cleanly
    {
      id: "bad-mode",
      title: "口试",
      type: "exam",
      dueAt: baseNow + 86_400_000,
      reminder: 15,
      examMode: "oral",
    },
    {
      id: "bad-location",
      title: "超长考场",
      type: "exam",
      dueAt: baseNow + 86_400_000,
      reminder: 15,
      location: "x".repeat(81),
    },
    {
      id: "bad-seat",
      title: "超长座位",
      type: "exam",
      dueAt: baseNow + 86_400_000,
      reminder: 15,
      seat: "9".repeat(33),
    },
    {
      id: "bad-note",
      title: "超长备注",
      type: "homework",
      dueAt: baseNow + 86_400_000,
      reminder: 0,
      note: "a".repeat(201),
    },
  ]);
  assert.equal(examNormalized.length, 2);
  assert.equal(examNormalized[0].location, "教三-201");
  assert.equal(examNormalized[0].seat, "15号");
  assert.equal(examNormalized[0].examMode, "closed");
  assert.equal(examNormalized[0].note, "带学生证和黑色签字笔");
  assert.equal("location" in examNormalized[1], false);
  assert.equal("seat" in examNormalized[1], false);
  assert.equal("note" in examNormalized[1], false);

  // Countdown formatting
  const overdueShort = tasksMod.formatTaskCountdown(baseNow - 20 * 60_000, baseNow);
  assert.equal(overdueShort.overdue, true);
  assert.equal(overdueShort.urgent, true);
  assert.equal(overdueShort.label, "已逾期");

  const overdueDays = tasksMod.formatTaskCountdown(baseNow - 2 * 86_400_000 - 1000, baseNow);
  assert.equal(overdueDays.overdue, true);
  assert.match(overdueDays.label, /已逾期 2 天/);

  const soonMins = tasksMod.formatTaskCountdown(baseNow + 25 * 60_000, baseNow);
  assert.equal(soonMins.urgent, true);
  assert.equal(soonMins.overdue, false);
  assert.equal(soonMins.label, "剩 25 分钟");

  const laterToday = tasksMod.formatTaskCountdown(
    new Date(2026, 5, 10, 14, 30, 0, 0).getTime(),
    baseNow,
  );
  assert.equal(laterToday.urgent, true);
  assert.equal(laterToday.overdue, false);
  assert.equal(laterToday.label, "今天 14:30");

  const tomorrow = tasksMod.formatTaskCountdown(
    new Date(2026, 5, 11, 9, 0, 0, 0).getTime(),
    baseNow,
  );
  assert.equal(tomorrow.label, "明天 09:00");
  assert.equal(tomorrow.urgent, true);

  const twoDays = tasksMod.formatTaskCountdown(
    new Date(2026, 5, 12, 14, 0, 0, 0).getTime(),
    baseNow,
  );
  assert.equal(twoDays.label, "剩 2 天");
  assert.equal(twoDays.urgent, false);
  assert.equal(twoDays.overdue, false);

  // getUpcomingTasks ordering, completion filtering & limit
  const upcoming = tasksMod.getUpcomingTasks(
    [
      { id: "done", title: "已完成", type: "homework", dueAt: baseNow + 60_000, reminder: 0, completedAt: baseNow - 1000 },
      { id: "ancient", title: "过期很久", type: "homework", dueAt: baseNow - 10 * 86_400_000, reminder: 0 },
      { id: "late", title: "三天后", type: "review", dueAt: baseNow + 3 * 86_400_000, reminder: 0 },
      { id: "early", title: "两小时后", type: "exam", dueAt: baseNow + 2 * 3_600_000, reminder: 60 },
      { id: "recent-overdue", title: "刚逾期", type: "homework", dueAt: baseNow - 3_600_000, reminder: 0 },
    ],
    baseNow,
    2,
  );
  assert.deepEqual(
    upcoming.map((t) => t.id),
    ["recent-overdue", "early"],
  );

  /* 2. useStore task CRUD & replaceActiveCourses */
  const { useStore } = load("src/store/useStore.ts");
  await useStore.persist.rehydrate();
  const s = useStore.getState();

  const id1 = s.addCourseTask({
    title: "高数期末考试",
    type: "exam",
    dueAt: baseNow + 2 * 86_400_000,
    reminder: 1440,
    course: { scheduleId: s.activeScheduleId, courseId: "c1", courseName: "高等数学" },
    location: "教三-201",
    seat: "15",
    examMode: "closed",
    note: "闭卷带计算器",
  });
  const id2 = s.addCourseTask({
    title: "线代习题 3",
    type: "homework",
    dueAt: baseNow + 6 * 3_600_000,
    reminder: 60,
  });
  assert.equal(useStore.getState().courseTasks.length, 2);

  useStore.getState().updateCourseTask(id1, {
    seat: "22",
    examMode: "open",
    note: undefined,
  });
  const updated1 = useStore.getState().courseTasks.find((t) => t.id === id1);
  assert.equal(updated1.seat, "22");
  assert.equal(updated1.examMode, "open");
  assert.equal("note" in updated1, false);

  useStore.getState().toggleCourseTask(id2);
  assert.ok(useStore.getState().courseTasks.find((t) => t.id === id2).completedAt > 0);
  useStore.getState().toggleCourseTask(id2);
  assert.equal(useStore.getState().courseTasks.find((t) => t.id === id2).completedAt, undefined);

  useStore.getState().toggleCourseTask(id2);
  useStore.getState().clearCompletedCourseTasks();
  assert.deepEqual(
    useStore.getState().courseTasks.map((t) => t.id),
    [id1],
  );

  const id3 = useStore.getState().addCourseTask({
    title: "临时复习",
    type: "review",
    dueAt: baseNow + 86_400_000,
    reminder: 15,
  });
  useStore.getState().removeCourseTask(id3);
  assert.deepEqual(
    useStore.getState().courseTasks.map((t) => t.id),
    [id1],
  );

  // replaceActiveCourses preserves unique IDs, rekeys empty/duplicate IDs, and extends periods
  const beforePeriods = useStore.getState().schedules[0].periods.length;
  useStore.getState().replaceActiveCourses([
    { id: "keep-id", name: "调休补课A", teacher: "张老师", classroom: "A101", weekday: 7, startPeriod: 1, endPeriod: 2, weeks: [5], color: "sky" },
    { id: "", name: "调休补课B", teacher: "", classroom: "B202", weekday: 7, startPeriod: 13, endPeriod: 14, weeks: [5], color: "amber" },
  ]);
  const activeAfterReplace = useStore.getState().schedules.find((x) => x.id === useStore.getState().activeScheduleId);
  assert.equal(activeAfterReplace.courses.length, 2);
  assert.equal(activeAfterReplace.courses[0].id, "keep-id");
  assert.ok(activeAfterReplace.courses[1].id.length > 0);
  assert.equal(activeAfterReplace.periods.length, Math.max(beforePeriods, 14));

  /* 3. buildCourseTaskReminders & syncCourseReminders */
  const remindersMod = load("src/services/courseReminders.ts");
  const futureBase = Date.now() + 3 * 86_400_000;
  const taskFixtures = [
    {
      id: "t-exam",
      title: "高数期末",
      type: "exam",
      dueAt: futureBase,
      reminder: 60,
      course: { scheduleId: "s1", courseId: "c1", courseName: "高等数学" },
      location: "教三-201",
      seat: "15",
      examMode: "closed",
    },
    {
      id: "t-hw",
      title: "线代作业",
      type: "homework",
      dueAt: futureBase - 86_400_000,
      reminder: 15,
    },
    {
      id: "t-done",
      title: "已完成作业",
      type: "homework",
      dueAt: futureBase,
      reminder: 60,
      completedAt: Date.now() - 1000,
    },
    {
      id: "t-no-rem",
      title: "不提醒任务",
      type: "review",
      dueAt: futureBase,
      reminder: 0,
    },
    {
      id: "t-past",
      title: "已过提醒点",
      type: "homework",
      dueAt: Date.now() + 5 * 60_000,
      reminder: 60,
    },
  ];

  const builtTaskReminders = remindersMod.buildCourseTaskReminders(taskFixtures, new Date());
  assert.equal(builtTaskReminders.length, 2);
  assert.equal(builtTaskReminders[0].title, "[作业提醒] 线代作业");
  assert.equal(builtTaskReminders[1].title, "[考试倒计时] 高数期末");
  assert.match(builtTaskReminders[1].body, /教三-201/);
  assert.match(builtTaskReminders[1].body, /座位 15/);
  assert.match(builtTaskReminders[1].body, /闭卷/);

  notifications.existing = [
    { identifier: "stale-task", content: { data: { kind: "dark-study-course-task", key: "stale" } } },
    { identifier: "unrelated", content: { data: { kind: "other-module", key: "keep" } } },
  ];
  await remindersMod.syncCourseReminders(activeAfterReplace, false, 15, 1, taskFixtures);
  assert.deepEqual(notifications.cancelled, ["stale-task"]);
  assert.equal(notifications.scheduled.length, 2);
  assert.ok(notifications.scheduled.every((n) => n.content.data.kind === "dark-study-course-task"));

  // Re-sync with completed tasks cancels previously scheduled task reminders
  notifications.existing = notifications.scheduled.map((req, idx) => ({
    identifier: `sched-${idx}`,
    content: req.content,
  }));
  notifications.scheduled = [];
  notifications.cancelled = [];
  await remindersMod.syncCourseReminders(activeAfterReplace, false, 15, 1, []);
  assert.equal(notifications.cancelled.length, 2);
  assert.equal(notifications.scheduled.length, 0);

  /* 4. ai.ts pendingTasks injection into Whale live snapshot */
  useStore.setState({
    courseTasks: [
      {
        id: "ai-t1",
        title: "高数期末",
        type: "exam",
        dueAt: futureBase,
        reminder: 1440,
        course: { scheduleId: "s1", courseId: "c1", courseName: "高等数学" },
        location: "教三-201",
        seat: "15",
        examMode: "closed",
      },
      {
        id: "ai-t2",
        title: "线代作业",
        type: "homework",
        dueAt: futureBase + 3_600_000,
        reminder: 60,
      },
      {
        id: "ai-t3",
        title: "大物实验报告",
        type: "homework",
        dueAt: futureBase + 2 * 3_600_000,
        reminder: 60,
      },
      {
        id: "ai-t4",
        title: "英语听力复习",
        type: "review",
        dueAt: futureBase + 3 * 3_600_000,
        reminder: 0,
      },
      {
        id: "ai-t5",
        title: "计组期中",
        type: "exam",
        dueAt: futureBase + 4 * 3_600_000,
        reminder: 60,
      },
      {
        id: "ai-t6-overflow",
        title: "第六项不应进入前五",
        type: "review",
        dueAt: futureBase + 5 * 3_600_000,
        reminder: 0,
      },
      {
        id: "ai-t-done",
        title: "已完成不展示",
        type: "homework",
        dueAt: futureBase - 3_600_000,
        reminder: 0,
        completedAt: Date.now() - 1000,
      },
    ],
  });

  const aiMod = load("src/services/ai.ts");
  const snapshot = aiMod.buildLiveSnapshotFromCtx(
    { schedule: activeAfterReplace, weekIndex: 1, schedules: [{ id: activeAfterReplace.id, name: activeAfterReplace.name }], persona: "whale" },
    new Date(),
  );
  assert.ok(snapshot.pendingTasks, "snapshot.pendingTasks must be populated from useStore.courseTasks");
  assert.match(snapshot.pendingTasks, /\[考试\] 高数期末/);
  assert.match(snapshot.pendingTasks, /高等数学/);
  assert.match(snapshot.pendingTasks, /考场 教三-201/);
  assert.match(snapshot.pendingTasks, /座位 15/);
  assert.match(snapshot.pendingTasks, /计组期中/);
  assert.doesNotMatch(snapshot.pendingTasks, /第六项不应进入前五/);
  assert.doesNotMatch(snapshot.pendingTasks, /已完成不展示/);

  aiCalls = [];
  await aiMod.askAssistant(
    [{ role: "user", content: "最近有什么考试吗" }],
    { schedule: activeAfterReplace, weekIndex: 1, schedules: [{ id: activeAfterReplace.id, name: activeAfterReplace.name }], persona: "whale" },
    "mock-key",
  );
  assert.ok(aiCalls.length >= 1);
  assert.match(aiCalls.at(-1)[0].content, /未完成课程待办：.*高数期末.*教三-201/);

  /* 5. backup.ts roundtrip for new AI settings & exam task fields */
  const backup = load("src/utils/backup.ts");
  const { DEFAULT_PERIODS, DEFAULT_GRADE_RULES, DEFAULT_GRADE_TYPES, DEFAULT_GRADE_YEARS, SAMPLE_SCHEDULE } = load("src/constants/sample.ts");

  const mainPayload = {
    version: 6,
    state: {
      schedules: [{ ...SAMPLE_SCHEDULE, periods: DEFAULT_PERIODS, courses: [] }],
      activeScheduleId: SAMPLE_SCHEDULE.id,
      grades: [],
      gradeYears: DEFAULT_GRADE_YEARS,
      activeGradeYearId: DEFAULT_GRADE_YEARS[0].id,
      gradeTypes: DEFAULT_GRADE_TYPES,
      gradeRules: DEFAULT_GRADE_RULES,
      activeGradeRuleId: DEFAULT_GRADE_RULES[0].id,
      activeGradeSemester: "fall",
      courseTasks: [
        {
          id: "bk-exam-1",
          title: "操作系统期末",
          type: "exam",
          dueAt: futureBase,
          reminder: 1440,
          course: { scheduleId: SAMPLE_SCHEDULE.id, courseId: "c-os", courseName: "操作系统" },
          location: "明理楼 B301",
          seat: "A12",
          examMode: "closed",
          note: "提前 15 分钟入场",
        },
      ],
    },
  };
  const settingsPayload = {
    version: 0,
    state: {
      apiKey: "secret-must-strip",
      appearance: "dark",
      aiProvider: "siliconflow",
      aiBaseUrl: "https://api.siliconflow.cn/v1/",
      aiTextModel: "Qwen/Qwen2.5-72B-Instruct",
      aiVisionModel: "Qwen/Qwen2.5-VL-72B-Instruct",
      updateMirrorPrefix: "https://gh-proxy.com/",
    },
  };

  const created = backup.createBackup([
    ["dark-study-storage", JSON.stringify(mainPayload)],
    ["dark-study-settings", JSON.stringify(settingsPayload)],
  ]);
  assert.equal(created.data["dark-study-settings"].state.aiProvider, "siliconflow");
  assert.equal(created.data["dark-study-settings"].state.aiBaseUrl, "https://api.siliconflow.cn/v1");
  assert.equal(created.data["dark-study-settings"].state.aiTextModel, "Qwen/Qwen2.5-72B-Instruct");
  assert.equal(created.data["dark-study-settings"].state.aiVisionModel, "Qwen/Qwen2.5-VL-72B-Instruct");
  assert.equal(created.data["dark-study-settings"].state.updateMirrorPrefix, "https://gh-proxy.com/");
  assert.equal("apiKey" in created.data["dark-study-settings"].state, false);
  assert.equal(created.data["dark-study-storage"].state.courseTasks[0].location, "明理楼 B301");
  assert.equal(created.data["dark-study-storage"].state.courseTasks[0].seat, "A12");
  assert.equal(created.data["dark-study-storage"].state.courseTasks[0].examMode, "closed");
  assert.equal(created.data["dark-study-storage"].state.courseTasks[0].note, "提前 15 分钟入场");

  // Replace & Merge restore preserve exam fields and AI provider settings
  const replacePlan = new Map(backup.buildRestorePlan(created, [], "replace"));
  const restoredSettings = JSON.parse(replacePlan.get("dark-study-settings")).state;
  const restoredStorage = JSON.parse(replacePlan.get("dark-study-storage")).state;
  assert.equal(restoredSettings.aiProvider, "siliconflow");
  assert.equal(restoredSettings.updateMirrorPrefix, "https://gh-proxy.com/");
  assert.equal(restoredStorage.courseTasks[0].seat, "A12");

  const existingMain = structuredClone(mainPayload);
  existingMain.state.courseTasks = [
    { id: "existing-hw", title: "已有作业", type: "homework", dueAt: futureBase, reminder: 0 },
  ];
  const mergePlan = new Map(
    backup.buildRestorePlan(created, [["dark-study-storage", JSON.stringify(existingMain)]], "merge"),
  );
  const mergedTasks = JSON.parse(mergePlan.get("dark-study-storage")).state.courseTasks;
  assert.equal(mergedTasks.length, 2);
  assert.equal(mergedTasks.find((t) => t.id === "bk-exam-1").examMode, "closed");

  // Backward compatibility: legacy backup without new AI/update fields and without exam task fields
  const legacyBackup = structuredClone(created);
  for (const field of ["aiProvider", "aiBaseUrl", "aiTextModel", "aiVisionModel", "updateMirrorPrefix"]) {
    delete legacyBackup.data["dark-study-settings"].state[field];
  }
  legacyBackup.data["dark-study-storage"].state.courseTasks = [
    { id: "old-task", title: "旧待办", type: "homework", dueAt: futureBase, reminder: 15 },
  ];
  const parsedLegacy = backup.parseBackup(JSON.stringify(legacyBackup));
  assert.equal(parsedLegacy.data["dark-study-storage"].state.courseTasks[0].title, "旧待办");

  // Invalid values rejected
  const badProvider = structuredClone(created);
  badProvider.data["dark-study-settings"].state.aiProvider = "invalid-provider";
  assert.throws(() => backup.parseBackup(JSON.stringify(badProvider)), /AI 服务商/);

  const badBaseUrl = structuredClone(created);
  badBaseUrl.data["dark-study-settings"].state.aiBaseUrl = "ftp://bad.example.com";
  assert.throws(() => backup.parseBackup(JSON.stringify(badBaseUrl)), /http/);

  const badMirror = structuredClone(created);
  badMirror.data["dark-study-settings"].state.updateMirrorPrefix = "javascript:alert(1)";
  assert.throws(() => backup.parseBackup(JSON.stringify(badMirror)), /http/);

  const badExamMode = structuredClone(created);
  badExamMode.data["dark-study-storage"].state.courseTasks[0].examMode = "oral";
  assert.throws(() => backup.parseBackup(JSON.stringify(badExamMode)), /课程待办/);

  console.log("PASS: course tasks model/countdown, useStore task CRUD & replaceActiveCourses, task reminders, AI pendingTasks injection, and backup AI-settings/exam-task roundtrip");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

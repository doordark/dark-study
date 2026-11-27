/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
    canAskAgain: false,
  };

  let platformOs = "android";

  const makeLoader = () =>
    createLoader({
      "react-native": {
        Platform: {
          get OS() {
            return platformOs;
          },
        },
      },
      "@react-native-async-storage/async-storage": storage,
      "expo-notifications": {
        setNotificationHandler() {},
        AndroidImportance: { HIGH: 4 },
        SchedulableTriggerInputTypes: { DATE: "date" },
        setNotificationChannelAsync: async () => {},
        getPermissionsAsync: async () => ({
          granted: notifications.granted,
          canAskAgain: notifications.canAskAgain,
        }),
        requestPermissionsAsync: async () => ({
          granted: notifications.granted,
        }),
        getAllScheduledNotificationsAsync: async () => notifications.existing,
        scheduleNotificationAsync: async (req) => {
          notifications.scheduled.push(req);
          return `focus-notif-${notifications.scheduled.length}`;
        },
        cancelScheduledNotificationAsync: async (id) => {
          notifications.cancelled.push(id);
        },
      },
    });

  const load = makeLoader();
  const progress = load("src/utils/studyProgress.ts");

  /* 1. Focus session elapsed-time math & normalization */
  const t0 = new Date(2026, 5, 15, 10, 0, 0, 0).getTime(); // 2026-06-15 10:00:00
  const sampleSession = {
    id: "fcs_test_1",
    mode: "focus",
    courseKey: "高等数学::张老师",
    courseName: "高等数学",
    totalSec: 25 * 60,
    remainingSec: 25 * 60,
    endAt: t0 + 25 * 60 * 1000,
    running: true,
    notificationId: "notif-1",
    ambientOn: true,
    startedAt: t0,
  };

  // Exact countdown across backgrounded wall-clock time
  assert.equal(progress.computeFocusRemainingSec(sampleSession, t0), 1500);
  assert.equal(
    progress.computeFocusRemainingSec(sampleSession, t0 + 10 * 60 * 1000),
    900,
  );
  assert.equal(
    progress.computeFocusElapsedSec(sampleSession, t0 + 10 * 60 * 1000),
    600,
  );
  assert.equal(
    progress.isFocusSessionCompleted(sampleSession, t0 + 24 * 60 * 1000),
    false,
  );
  assert.equal(
    progress.computeFocusRemainingSec(sampleSession, t0 + 25 * 60 * 1000),
    0,
  );
  assert.equal(
    progress.isFocusSessionCompleted(sampleSession, t0 + 25 * 60 * 1000),
    true,
  );
  assert.equal(
    progress.computeFocusRemainingSec(sampleSession, t0 + 40 * 60 * 1000),
    0,
  );

  // Paused session freezes remainingSec regardless of wall-clock advance
  const pausedSession = {
    ...sampleSession,
    running: false,
    endAt: null,
    remainingSec: 842,
  };
  assert.equal(
    progress.computeFocusRemainingSec(pausedSession, t0 + 60 * 60 * 1000),
    842,
  );
  assert.equal(
    progress.computeFocusElapsedSec(pausedSession, t0 + 60 * 60 * 1000),
    1500 - 842,
  );
  assert.equal(progress.formatFocusCountdown(842), "14:02");
  assert.equal(progress.formatFocusCountdown(0), "00:00");
  assert.equal(progress.formatFocusCountdown(-12), "00:00");

  // Normalization guards
  const normalizedGood = progress.normalizeActiveFocusSession(sampleSession);
  assert.equal(normalizedGood.id, "fcs_test_1");
  assert.equal(normalizedGood.ambientOn, true);
  assert.equal(normalizedGood.notificationId, "notif-1");

  // Running session without endAt is downgraded safely to paused
  const normalizedBrokenRunning = progress.normalizeActiveFocusSession({
    ...sampleSession,
    running: true,
    endAt: null,
    remainingSec: 500,
  });
  assert.equal(normalizedBrokenRunning.running, false);
  assert.equal(normalizedBrokenRunning.endAt, null);
  assert.equal(normalizedBrokenRunning.remainingSec, 500);

  // Invalid mode or missing fields rejected cleanly
  assert.equal(
    progress.normalizeActiveFocusSession({ ...sampleSession, mode: "invalid" }),
    null,
  );
  assert.equal(progress.normalizeActiveFocusSession(null), null);
  assert.equal(progress.normalizeActiveFocusSession({}), null);

  // Legacy study progress snapshot without activeFocusSession stays 100% compatible
  const legacyState = progress.normalizeStudyProgressState({
    attendanceByCourse: {},
    customAbsenceLimits: {},
    focusLogs: [],
    pendingFarmRewards: [],
  });
  assert.equal(legacyState.activeFocusSession, null);

  /* 2. useStudyProgress store actions, persistence, rehydration & short-break mode */
  const { useStudyProgress, STUDY_PROGRESS_STORAGE_KEY } = load(
    "src/store/useStudyProgress.ts",
  );
  await useStudyProgress.persist.rehydrate();

  const mathCourse = { name: "高等数学", teacher: "张老师" };
  const started = useStudyProgress.getState().startFocusSession({
    mode: "focus",
    course: mathCourse,
    durationMinutes: 25,
    ambientOn: true,
    now: t0,
  });
  assert.equal(started.mode, "focus");
  assert.equal(started.totalSec, 1500);
  assert.equal(started.endAt, t0 + 1500 * 1000);
  assert.equal(started.running, true);
  assert.equal(started.ambientOn, true);

  // Attach notification ID for current session; stale session ID must be ignored
  useStudyProgress.getState().setFocusNotificationId("wrong-session", "stale-id");
  assert.equal(useStudyProgress.getState().activeFocusSession.notificationId, null);
  useStudyProgress.getState().setFocusNotificationId(started.id, "notif-active-1");
  assert.equal(
    useStudyProgress.getState().activeFocusSession.notificationId,
    "notif-active-1",
  );

  // Persist & rehydrate mid-session in a fresh module instance (simulates app kill/reopen!)
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(disk.has(STUDY_PROGRESS_STORAGE_KEY), "active session must persist to AsyncStorage");
  const loadFresh = makeLoader();
  const freshStore = loadFresh("src/store/useStudyProgress.ts").useStudyProgress;
  await freshStore.persist.rehydrate();
  const rehydratedSession = freshStore.getState().activeFocusSession;
  assert.ok(rehydratedSession, "activeFocusSession must survive app restart/rehydration");
  assert.equal(rehydratedSession.id, started.id);
  assert.equal(rehydratedSession.notificationId, "notif-active-1");

  // Sync after 12 minutes elapsed in background
  const midSync = freshStore
    .getState()
    .tickOrSyncFocusSession(t0 + 12 * 60 * 1000);
  assert.equal(midSync.remainingSec, 13 * 60);
  assert.equal(midSync.completed, false);

  // Pause at 12m elapsed, wait 30 minutes, then resume -> remaining must stay 13m!
  const paused = freshStore
    .getState()
    .pauseFocusSession(t0 + 12 * 60 * 1000);
  assert.equal(paused.running, false);
  assert.equal(paused.remainingSec, 13 * 60);
  assert.equal(paused.endAt, null);

  const resumeTime = t0 + 42 * 60 * 1000;
  const resumed = freshStore
    .getState()
    .resumeFocusSession({ now: resumeTime, notificationId: "notif-resumed" });
  assert.equal(resumed.running, true);
  assert.equal(resumed.remainingSec, 13 * 60);
  assert.equal(resumed.endAt, resumeTime + 13 * 60 * 1000);
  assert.equal(resumed.notificationId, "notif-resumed");

  // Toggle ambient sound on active session
  freshStore.getState().setFocusAmbient(false);
  assert.equal(freshStore.getState().activeFocusSession.ambientOn, false);

  // Finish after full remaining 13m -> completed: true & atomic settlement awards 32 dark币
  const endTime = resumeTime + 13 * 60 * 1000 + 500;
  const doneSync = freshStore.getState().tickOrSyncFocusSession(endTime);
  assert.equal(doneSync.completed, true);
  assert.equal(doneSync.remainingSec, 0);

  const completion = freshStore
    .getState()
    .completeActiveFocusSession({ now: endTime, early: false });
  assert.equal(completion.mode, "focus");
  assert.equal(completion.minutes, 25);
  assert.equal(completion.reward.coins, 32);
  assert.equal(freshStore.getState().activeFocusSession, null);
  assert.equal(freshStore.getState().focusLogs.length, 1);
  assert.equal(freshStore.getState().pendingFarmRewards.length, 1);

  // Second completion call is an atomic no-op (prevents double rewards)
  assert.equal(
    freshStore.getState().completeActiveFocusSession({ now: endTime }),
    null,
  );
  assert.equal(freshStore.getState().focusLogs.length, 1);

  // Early finish calculation (elapsed ~10m out of 25m)
  freshStore.getState().startFocusSession({
    mode: "focus",
    course: mathCourse,
    durationMinutes: 25,
    now: t0,
  });
  const earlyCompletion = freshStore
    .getState()
    .completeActiveFocusSession({ now: t0 + 10 * 60 * 1000, early: true });
  assert.equal(earlyCompletion.minutes, 10);
  assert.equal(freshStore.getState().focusLogs.length, 2);

  // Short-break mode (5 minutes): does NOT add focus logs or farm rewards
  const brk = freshStore.getState().startFocusSession({
    mode: "break",
    course: mathCourse,
    durationMinutes: progress.SHORT_BREAK_MINUTES,
    now: t0,
  });
  assert.equal(brk.mode, "break");
  assert.equal(brk.totalSec, 5 * 60);
  const brkCompletion = freshStore
    .getState()
    .completeActiveFocusSession({ now: t0 + 5 * 60 * 1000, early: false });
  assert.equal(brkCompletion.mode, "break");
  assert.equal(brkCompletion.minutes, 5);
  assert.equal(brkCompletion.log, undefined);
  assert.equal(brkCompletion.reward, undefined);
  assert.equal(freshStore.getState().focusLogs.length, 2);
  assert.equal(freshStore.getState().pendingFarmRewards.length, 2);

  // Clear focus session returns previous session and clears store
  const toClear = freshStore.getState().startFocusSession({
    mode: "focus",
    course: mathCourse,
    durationMinutes: 15,
    notificationId: "notif-to-cancel",
    now: t0,
  });
  const cleared = freshStore.getState().clearFocusSession();
  assert.equal(cleared.id, toClear.id);
  assert.equal(cleared.notificationId, "notif-to-cancel");
  assert.equal(freshStore.getState().activeFocusSession, null);

  // Rehydrating legacy AsyncStorage JSON without activeFocusSession works cleanly
  disk.set(
    STUDY_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      version: 0,
      state: {
        attendanceByCourse: {},
        customAbsenceLimits: {},
        focusLogs: [],
        pendingFarmRewards: [],
      },
    }),
  );
  const legacyStore = makeLoader()("src/store/useStudyProgress.ts").useStudyProgress;
  await legacyStore.persist.rehydrate();
  assert.equal(legacyStore.getState().activeFocusSession, null);

  /* 3. Focus completion local notifications (courseReminders.ts) */
  const remindersMod = load("src/services/courseReminders.ts");
  const futureEnd = Date.now() + 25 * 60 * 1000;
  const notifId = await remindersMod.scheduleFocusCompletionNotification(
    futureEnd,
    "高等数学 专注完成",
    "已完成 25 分钟专注",
  );
  assert.equal(notifId, "focus-notif-1");
  assert.equal(notifications.scheduled.length, 1);
  assert.equal(
    notifications.scheduled[0].content.data.kind,
    "dark-study-focus-complete",
  );
  assert.equal(notifications.scheduled[0].trigger.channelId, "course-reminders");

  // syncCourseReminders must NOT cancel a scheduled focus completion notification
  notifications.existing = [
    {
      identifier: "focus-notif-1",
      content: { data: { kind: "dark-study-focus-complete" } },
    },
  ];
  notifications.cancelled = [];
  await remindersMod.syncCourseReminders(undefined, false, 15, 1, []);
  assert.deepEqual(notifications.cancelled, []);

  await remindersMod.cancelFocusCompletionNotification(notifId);
  assert.deepEqual(notifications.cancelled, ["focus-notif-1"]);
  await remindersMod.cancelFocusCompletionNotification(null);
  assert.equal(notifications.cancelled.length, 1);

  // Permission denied -> graceful null
  notifications.granted = false;
  const deniedId = await remindersMod.scheduleFocusCompletionNotification(
    futureEnd,
    "test",
    "test",
  );
  assert.equal(deniedId, null);

  // Web platform -> graceful no-op
  notifications.granted = true;
  platformOs = "web";
  const webId = await remindersMod.scheduleFocusCompletionNotification(
    futureEnd,
    "test",
    "test",
  );
  assert.equal(webId, null);
  platformOs = "android";

  /* 4. Exam Week Admission-Ticket Timeline (buildExamTimeline) */
  const examNow = new Date(2026, 5, 15, 10, 0, 0, 0).getTime(); // 2026-06-15 10:00 (Monday)
  const examTasks = [
    {
      id: "hw-1",
      title: "线代作业",
      type: "homework",
      dueAt: examNow + 3_600_000,
      reminder: 60,
    },
    {
      id: "exam-done",
      title: "已考完的英语",
      type: "exam",
      dueAt: examNow + 3_600_000,
      reminder: 60,
      completedAt: examNow - 1000,
    },
    {
      id: "exam-ancient",
      title: "上周已结束的期中",
      type: "exam",
      dueAt: examNow - 5 * 86_400_000,
      reminder: 0,
    },
    {
      id: "exam-later",
      title: "操作系统期末",
      type: "exam",
      dueAt: new Date(2026, 5, 18, 14, 30, 0, 0).getTime(),
      reminder: 1440,
      course: { scheduleId: "s1", courseId: "c-os", courseName: "操作系统" },
      location: "明理楼 B301",
      seat: "A12",
      examMode: "open",
    },
    {
      id: "exam-today",
      title: "高等数学期末考试",
      type: "exam",
      dueAt: new Date(2026, 5, 15, 14, 0, 0, 0).getTime(),
      reminder: 60,
      course: { scheduleId: "s1", courseId: "c-math", courseName: "高等数学" },
      location: "教三-201",
      seat: "15号",
      examMode: "closed",
      note: "带学生证",
    },
    {
      id: "exam-in-progress",
      title: "大学物理",
      type: "exam",
      dueAt: examNow - 45 * 60_000, // started 45m ago (inside 3h grace window)
      reminder: 0,
      location: "理教-105",
      seat: "08",
      examMode: "closed",
    },
  ];

  const timeline = progress.buildExamTimeline(examTasks, examNow);
  assert.deepEqual(
    timeline.map((item) => item.task.id),
    ["exam-in-progress", "exam-today", "exam-later"],
  );
  assert.equal(timeline[1].dateLabel, "06/15");
  assert.equal(timeline[1].weekdayLabel, "周一");
  assert.equal(timeline[1].timeLabel, "14:00");
  assert.equal(timeline[1].courseName, "高等数学");
  assert.equal(timeline[1].location, "教三-201");
  assert.equal(timeline[1].seat, "15号");
  assert.equal(timeline[1].examModeLabel, "闭卷");
  assert.equal(timeline[1].isToday, true);
  assert.equal(timeline[1].countdown.label, "今天 14:00");

  assert.equal(timeline[2].dateLabel, "06/18");
  assert.equal(timeline[2].weekdayLabel, "周四");
  assert.equal(timeline[2].examModeLabel, "开卷");
  assert.equal(timeline[2].isToday, false);
  assert.equal(timeline[2].countdown.label, "剩 3 天");

  // With overdueWindowMs = 0, already-started exams are filtered out
  const strictFutureTimeline = progress.buildExamTimeline(examTasks, examNow, {
    overdueWindowMs: 0,
  });
  assert.deepEqual(
    strictFutureTimeline.map((item) => item.task.id),
    ["exam-today", "exam-later"],
  );

  /* 5. Semester Study Review Dashboard Aggregation */
  const dayMs = 86_400_000;
  const reviewNow = new Date(2026, 5, 15, 16, 0, 0, 0).getTime(); // 2026-06-15
  const logs = [
    {
      id: "l1",
      courseKey: "高等数学::张老师",
      courseName: "高等数学",
      minutes: 45,
      coinsAwarded: 60,
      at: reviewNow - 1000, // today
    },
    {
      id: "l2",
      courseKey: "数据结构::王老师",
      courseName: "数据结构",
      minutes: 25,
      coinsAwarded: 32,
      at: reviewNow - dayMs, // yesterday
    },
    {
      id: "l3",
      courseKey: "高等数学::张老师",
      courseName: "高等数学",
      minutes: 25,
      coinsAwarded: 32,
      at: reviewNow - 2 * dayMs, // 2 days ago
    },
    {
      id: "l4",
      courseKey: "大学英语::李老师",
      courseName: "大学英语",
      minutes: 15,
      coinsAwarded: 18,
      at: reviewNow - 10 * dayMs, // 10 days ago (outside 7-day window & streak)
    },
  ];
  const attendance = {
    "高等数学::张老师": [
      { id: "a1", courseKey: "高等数学::张老师", courseName: "高等数学", dateIso: "2026-06-10", status: "present", at: reviewNow },
      { id: "a2", courseKey: "高等数学::张老师", courseName: "高等数学", dateIso: "2026-06-12", status: "present", at: reviewNow },
      { id: "a3", courseKey: "高等数学::张老师", courseName: "高等数学", dateIso: "2026-06-14", status: "absent", at: reviewNow },
    ],
    "数据结构::王老师": [
      { id: "a4", courseKey: "数据结构::王老师", courseName: "数据结构", dateIso: "2026-06-13", status: "leave", at: reviewNow },
    ],
  };

  const review = progress.buildStudyReviewSummary(logs, attendance, reviewNow);
  assert.equal(review.totalFocusMinutes, 110);
  assert.equal(review.totalFocusSessions, 4);
  assert.equal(review.todayFocusMinutes, 45);
  assert.equal(review.last7DaysMinutes, 95);
  assert.equal(review.activeDaysLast7, 3);
  assert.equal(review.streakDays, 3);
  assert.equal(review.dailyLast7.length, 7);
  assert.equal(review.dailyLast7[6].isToday, true);
  assert.equal(review.dailyLast7[6].minutes, 45);
  assert.equal(review.dailyLast7[5].minutes, 25);
  assert.equal(review.dailyLast7[4].minutes, 25);

  assert.deepEqual(
    review.topCourses.map((c) => [c.courseName, c.minutes, c.sessions]),
    [
      ["高等数学", 70, 2],
      ["数据结构", 25, 1],
      ["大学英语", 15, 1],
    ],
  );
  assert.ok(Math.abs(review.topCourses.reduce((s, c) => s + c.ratio, 0) - 1) < 1e-6);

  assert.equal(review.attendance.present, 2);
  assert.equal(review.attendance.leave, 1);
  assert.equal(review.attendance.absent, 1);
  assert.equal(review.attendance.totalRecords, 4);
  assert.equal(review.attendance.trackedCourses, 2);
  assert.equal(review.attendance.attendanceRate, 0.5);

  // Streak ending yesterday stays alive today; gap > 1 day resets to 0
  assert.equal(
    progress.computeFocusStreakDays(logs.slice(1), reviewNow),
    2,
    "streak ending yesterday remains active today",
  );
  assert.equal(
    progress.computeFocusStreakDays(logs.slice(2), reviewNow),
    0,
    "missing both today and yesterday breaks streak",
  );
  const emptyReview = progress.buildStudyReviewSummary([], {}, reviewNow);
  assert.equal(emptyReview.totalFocusMinutes, 0);
  assert.equal(emptyReview.streakDays, 0);
  assert.equal(emptyReview.attendance.attendanceRate, null);

  /* 6. Naming sync guard across all owned source files */
  const ownedFiles = [
    "src/utils/studyProgress.ts",
    "src/store/useStudyProgress.ts",
    "src/services/courseReminders.ts",
    "src/components/CourseStudyModal.tsx",
    "src/components/FocusMiniBanner.tsx",
    "src/components/CourseTaskSheet.tsx",
    "src/components/CourseSearchStatsModal.tsx",
    "src/screens/CourseScheduleScreen.tsx",
  ];
  for (const rel of ownedFiles) {
    const content = fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
    assert.equal(
      content.includes("星露坡"),
      false,
      `${rel} must not contain legacy name 星露坡`,
    );
    assert.equal(
      content.includes("金币"),
      false,
      `${rel} must not contain legacy currency 金币`,
    );
  }

  console.log(
    "PASS: focus session persistence/rehydration/elapsed math, short break, focus notifications, exam week admission-ticket timeline, semester study review dashboard, and naming sync",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

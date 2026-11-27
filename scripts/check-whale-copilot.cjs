const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const createLoader = require("./load-project-ts.cjs");

const root = path.resolve(__dirname, "..");

function makeEnv(extraMocks = {}) {
  const disk = new Map();
  const secure = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      disk.set(key, value);
    },
    removeItem: async (key) => {
      disk.delete(key);
    },
    multiGet: async (keys) => keys.map((k) => [k, disk.get(k) ?? null]),
    multiSet: async (rows) => {
      for (const [k, v] of rows) disk.set(k, v);
    },
    multiRemove: async (keys) => {
      for (const k of keys) disk.delete(k);
    },
  };
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: async (k) => (secure.has(k) ? secure.get(k) : null),
    setItemAsync: async (k, v) => {
      secure.set(k, v);
    },
    deleteItemAsync: async (k) => {
      secure.delete(k);
    },
  };
  const load = createLoader({
    "react-native": { Platform: { OS: "android" } },
    "@react-native-async-storage/async-storage": storage,
    "expo-secure-store": secureStore,
    "@/services/offlineImport": {},
    ...extraMocks,
  });
  return { disk, secure, load };
}

async function flushWrites(load) {
  const { flushPendingWrites } = load("src/utils/coalescedWriter.ts");
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await flushPendingWrites();
  }
}

function buildSampleSchedule() {
  return {
    id: "sched-1",
    name: "2026 秋季学期",
    kind: "fall",
    startDate: "2026-09-07",
    endDate: "2027-01-10",
    totalWeeks: 18,
    periods: [
      { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
      { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
      { index: 3, label: "第3节", startTime: "10:00", endTime: "10:45" },
      { index: 4, label: "第4节", startTime: "10:55", endTime: "11:40" },
      { index: 5, label: "第5节", startTime: "14:00", endTime: "14:45" },
      { index: 6, label: "第6节", startTime: "14:55", endTime: "15:40" },
      { index: 7, label: "第7节", startTime: "16:00", endTime: "16:45" },
      { index: 8, label: "第8节", startTime: "16:55", endTime: "17:40" },
    ],
    courses: [
      {
        id: "c-math",
        name: "高等数学",
        teacher: "胡老师",
        classroom: "教三204",
        weekday: 1,
        startPeriod: 1,
        endPeriod: 4,
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        color: "sky",
        credits: 5,
      },
      {
        id: "c-math-2",
        name: "高等数学",
        teacher: "胡老师",
        classroom: "教三204",
        weekday: 4,
        startPeriod: 5,
        endPeriod: 8,
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        color: "sky",
        credits: 5,
      },
      {
        id: "c-eng",
        name: "大学英语",
        teacher: "李老师",
        classroom: "语林102",
        weekday: 2,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [1, 3, 5, 7, 9, 11],
        color: "emerald",
        credits: 2,
      },
      {
        id: "c-full",
        name: "整天实验",
        teacher: "周老师",
        classroom: "实验楼A1",
        weekday: 5,
        startPeriod: 1,
        endPeriod: 8,
        weeks: [1, 2, 3, 4, 5, 6],
        color: "amber",
        credits: 2,
      },
    ],
  };
}

async function run() {
  /* 1. studyCopilot pure helpers */
  const { load: pureLoad } = makeEnv();
  const copilot = pureLoad("src/utils/studyCopilot.ts");
  const schedule = buildSampleSchedule();

  // 1a. computeWeeklyFreeSlots
  const week1Slots = copilot.computeWeeklyFreeSlots(schedule, 1);
  assert.ok(week1Slots.length > 0 && week1Slots.length <= 300, "freeSlots must stay compact <= 300 chars");
  assert.match(week1Slots, /周一 14:00-17:40/);
  assert.match(week1Slots, /周二 08:00-09:40\/14:00-17:40/);
  assert.match(week1Slots, /周三 全天空闲/);
  assert.match(week1Slots, /周四 08:00-11:40/);
  assert.ok(!week1Slots.includes("周五"), "fully occupied Friday should not be listed as free");
  assert.match(week1Slots, /周六 全天空闲/);
  assert.match(week1Slots, /周日 全天空闲/);

  // Even week: 大学英语 only on odd weeks, so Tuesday is fully free in week 2
  const week2Slots = copilot.computeWeeklyFreeSlots(schedule, 2);
  assert.match(week2Slots, /周二 全天空闲/);
  assert.equal(copilot.computeWeeklyFreeSlots(undefined, 1), "");
  assert.equal(copilot.computeWeeklyFreeSlots(schedule, 0), "");

  // Compactness cap check with many fragmented periods
  const densePeriods = Array.from({ length: 16 }, (_, i) => ({
    index: i + 1,
    label: `第${i + 1}节`,
    startTime: `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`,
    endTime: `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "25" : "55"}`,
  }));
  const fragmentedSchedule = {
    ...schedule,
    periods: densePeriods,
    courses: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) =>
      [2, 4, 6, 8, 10, 12, 14].map((p) => ({
        id: `d-${weekday}-${p}`,
        name: `课${weekday}-${p}`,
        teacher: "T",
        classroom: "",
        weekday,
        startPeriod: p,
        endPeriod: p,
        weeks: [1],
        color: "sky",
      })),
    ),
  };
  const denseSlots = copilot.computeWeeklyFreeSlots(fragmentedSchedule, 1);
  assert.ok(denseSlots.length <= 300, `dense freeSlots should cap at <= 300 chars, got ${denseSlots.length}`);

  // 1b. summarizeGradesForCopilot
  assert.equal(copilot.summarizeGradesForCopilot([], [], []), "");
  const gradeYears = [
    { id: "y1", name: "大一" },
    { id: "y2", name: "大二" },
  ];
  const gradeTypes = [
    { id: "required", name: "必修课" },
    { id: "elective", name: "选修课" },
  ];
  const grades = [
    { id: "g1", name: "高等数学", credit: 5, scoreType: "numeric", score: "72", gpa: 2.2, yearId: "y1", semester: "fall", type: "required" },
    { id: "g2", name: "大学物理", credit: 4, scoreType: "numeric", score: "76", gpa: 2.6, yearId: "y1", semester: "spring", type: "required" },
    { id: "g3", name: "数据结构", credit: 4, scoreType: "numeric", score: "84", gpa: 3.4, yearId: "y2", semester: "fall", type: "required" },
    { id: "g4", name: "程序设计", credit: 3, scoreType: "numeric", score: "100", gpa: 5.0, yearId: "y2", semester: "fall", type: "required" },
    { id: "g5", name: "通识音乐", credit: 1, scoreType: "numeric", score: "65", gpa: 1.5, yearId: "y2", semester: "fall", type: "elective" },
  ];
  const gradeSummary = copilot.summarizeGradesForCopilot(grades, gradeYears, gradeTypes, undefined, "five");
  assert.ok(gradeSummary.length > 0 && gradeSummary.length <= 300, "gradeSummary must stay <= 300 chars");
  assert.match(gradeSummary, /总GPA/);
  assert.match(gradeSummary, /加权均分/);
  assert.match(gradeSummary, /已获 17 学分/);
  assert.match(gradeSummary, /提分关注：高等数学\(5学分\/72分\)/);
  assert.match(gradeSummary, /大学物理\(4学分\/76分\)/);
  assert.ok(!gradeSummary.includes("程序设计"), "full-GPA course must not appear in improvement priority list");

  // Respects rule exclusions
  const exclRule = { id: "r1", name: "仅必修", excludedTypes: ["elective"], excludedCourseIds: ["g1"] };
  const filteredSummary = copilot.summarizeGradesForCopilot(grades, gradeYears, gradeTypes, exclRule, "four_std");
  assert.match(filteredSummary, /4\.0 分段/);
  assert.ok(!filteredSummary.includes("高等数学"), "excluded course must be omitted from summary");

  // 1c. summarizeAttendanceRisks
  // 高等数学 has 12 unique weeks -> default redline = max(2, floor(12/3)) = 4 -> warn at 3, danger at 4
  // 大学英语 has 6 unique weeks -> default redline = max(2, floor(6/3)) = 2 -> warn at 1, danger at 2
  assert.equal(
    copilot.summarizeAttendanceRisks(schedule, {
      "高等数学|胡老师": [{ status: "absent", dateIso: "2026-09-14" }],
    }),
    "",
    "1/4 absence is safe and should not alert",
  );
  const alerts = copilot.summarizeAttendanceRisks(
    schedule,
    {
      "高等数学|胡老师": [
        { status: "absent", dateIso: "2026-09-14" },
        { status: "absent", dateIso: "2026-09-21" },
        { status: "absent", dateIso: "2026-09-28" },
        { status: "leave", dateIso: "2026-10-05" },
      ],
      "大学英语|李老师": [
        { status: "absent", dateIso: "2026-09-15" },
        { status: "absent", dateIso: "2026-09-29" },
      ],
      "整天实验|周老师": [{ status: "present", dateIso: "2026-09-18" }],
    },
    { "整天实验|周老师": 1 },
  );
  assert.match(alerts, /大学英语（已缺勤 2\/2 次，已达红线）/);
  assert.match(alerts, /高等数学（已缺勤 3\/4 次，临近红线）/);
  assert.ok(!alerts.includes("整天实验"), "0 absence must never false-alarm even when customLimit=1");
  assert.ok(alerts.indexOf("大学英语") < alerts.indexOf("高等数学"), "danger alerts sort before warnings");

  // Custom limit tightening & studyProgress "::" courseIdentityKey compatibility (including spaces)
  const spacedSchedule = {
    ...schedule,
    courses: [
      ...schedule.courses,
      {
        id: "c-spaced",
        name: "高等数学 A",
        teacher: "Charley Qing",
        classroom: "新教201",
        weekday: 3,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3, 4, 5, 6],
        color: "violet",
      },
    ],
  };
  const customAlerts = copilot.summarizeAttendanceRisks(
    spacedSchedule,
    {
      "高等数学": [
        { status: "absent", dateIso: "2026-09-14" },
        { status: "absent", dateIso: "2026-09-21" },
      ],
      "高等数学 a::charley qing": [
        { status: "absent", dateIso: "2026-09-16" },
      ],
    },
    { "高等数学": 2 },
  );
  assert.match(customAlerts, /高等数学（已缺勤 2\/2 次，已达红线）/);
  assert.match(customAlerts, /高等数学 A（已缺勤 1\/2 次，临近红线）/);

  // 1d. summarizeRecentFocus
  const nowMs = new Date(2026, 9, 12, 15, 0, 0).getTime(); // 2026-10-12 15:00
  assert.equal(copilot.summarizeRecentFocus([], nowMs), "");
  assert.equal(
    copilot.summarizeRecentFocus(
      [{ courseName: "高等数学", minutes: 45, at: nowMs - 8 * 86_400_000 }],
      nowMs,
    ),
    "",
    "logs older than 7 days must be excluded",
  );
  const focusSummary = copilot.summarizeRecentFocus(
    [
      { courseName: "高等数学", minutes: 45, at: nowMs - 2 * 86_400_000 },
      { courseName: "数据结构", minutes: 25, at: nowMs - 86_400_000 },
      { courseName: "高等数学", minutes: 25, at: nowMs - 3_600_000 },
      { courseName: "旧课程", minutes: 90, at: nowMs - 10 * 86_400_000 },
    ],
    nowMs,
  );
  assert.match(focusSummary, /95 分钟/);
  assert.match(focusSummary, /3 次/);
  assert.match(focusSummary, /最专注学科：高等数学（70 分钟）/);

  /* 2. whaleContext live snapshot rendering */
  const whaleContext = pureLoad("src/services/whaleContext.ts");
  const fullBlock = whaleContext.buildLiveContextBlock({
    nowLabel: "2026-10-12 周一 15:00（下午）",
    freeSlots: week1Slots,
    gradesSummary: gradeSummary,
    attendanceAlerts: alerts,
    focusSummary,
  });
  assert.match(fullBlock, /- 本周空课安排：/);
  assert.match(fullBlock, /- 成绩与绩点概况：/);
  assert.match(fullBlock, /- 考勤红线预警：/);
  assert.match(fullBlock, /- 近期学习专注：/);

  const minimalBlock = whaleContext.buildLiveContextBlock({
    nowLabel: "2026-10-12 周一 15:00（下午）",
  });
  assert.ok(!minimalBlock.includes("本周空课安排"));
  assert.ok(!minimalBlock.includes("成绩与绩点概况"));
  assert.ok(!minimalBlock.includes("考勤红线预警"));
  assert.ok(!minimalBlock.includes("近期学习专注"));

  /* 3. useSettings new fields + privacy gating + SecureStore invariant */
  const sundayNow = new Date(2026, 9, 11, 10, 0, 0); // Sunday (no classes today)
  const sundayNowMs = sundayNow.getTime();
  const capturedPrompts = [];
  const capturedAgentCalls = [];
  let mockAiReturn = { reply: "好的，已整理待办", actions: [] };
  const appEnv = makeEnv({
    "@/services/deepseek": {
      TEXT_MODEL: "mock-text",
      VISION_MODEL: "mock-vision",
      DeepSeekError: class DeepSeekError extends Error {
        constructor(msg, status) {
          super(msg);
          this.status = status;
        }
      },
      chatJson: async (messages) => {
        capturedPrompts.push(messages[0]?.content ?? "");
        return mockAiReturn;
      },
      chatAgentTurn: undefined, // exercise JSON fallback path in askAssistant
    },
    "@/store/useStudyProgress": {
      useStudyProgress: {
        getState: () => ({
          attendanceByCourse: {
            "大学英语::李老师": [
              { status: "absent", dateIso: "2026-09-15" },
              { status: "absent", dateIso: "2026-09-29" },
            ],
          },
          customAbsenceLimits: {},
          focusLogs: [
            { courseName: "高等数学", minutes: 45, at: sundayNowMs - 3_600_000 },
          ],
        }),
      },
    },
  });

  const { useSettings } = appEnv.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();

  assert.equal(useSettings.getState().whaleShareGrades, true, "whaleShareGrades defaults to true");
  assert.equal(useSettings.getState().liveClassNotification, false, "liveClassNotification defaults to false");

  useSettings.getState().setApiKey("sk-never-persist");
  useSettings.getState().setWhaleShareGrades(false);
  useSettings.getState().setLiveClassNotification(true);
  await flushWrites(appEnv.load);

  const persistedRaw = appEnv.disk.get("dark-study-settings");
  assert.ok(persistedRaw, "settings must persist to AsyncStorage");
  const persisted = JSON.parse(persistedRaw);
  assert.equal(persisted.state.whaleShareGrades, false);
  assert.equal(persisted.state.liveClassNotification, true);
  assert.equal("apiKey" in persisted.state, false, "apiKey must remain excluded from AsyncStorage");
  assert.equal("apiKeyHydrated" in persisted.state, false, "apiKeyHydrated must remain excluded from AsyncStorage");

  // Privacy toggle gating in buildLiveSnapshotFromCtx & askAssistant
  const { useStore } = appEnv.load("src/store/useStore.ts");
  await useStore.persist.rehydrate();
  useStore.setState({
    schedules: [schedule],
    activeScheduleId: schedule.id,
    grades,
    gradeYears,
    gradeTypes,
    courseTasks: [],
  });

  const aiMod = appEnv.load("src/services/ai.ts");
  const ctx = {
    schedule,
    weekIndex: 1,
    schedules: [{ id: schedule.id, name: schedule.name }],
    persona: "whale",
  };

  // whaleShareGrades === false -> gradesSummary MUST be omitted even on class-free day
  useSettings.getState().setWhaleShareGrades(false);
  const snapDisabled = aiMod.buildLiveSnapshotFromCtx(ctx, sundayNow);
  assert.equal(snapDisabled.todayCourses, "今天没有排课");
  assert.ok(snapDisabled.freeSlots && snapDisabled.freeSlots.includes("周三 全天空闲"));
  assert.equal(snapDisabled.gradesSummary, undefined, "gradesSummary must be omitted when whaleShareGrades=false");
  assert.match(snapDisabled.attendanceAlerts ?? "", /大学英语/);
  assert.match(snapDisabled.focusSummary ?? "", /高等数学/);

  await aiMod.askAssistant([{ role: "user", content: "帮我看看复习计划" }], ctx, "mock-key");
  assert.ok(
    !capturedPrompts[capturedPrompts.length - 1].includes("成绩与绩点概况"),
    "system prompt must not include grades when whaleShareGrades=false",
  );

  // whaleShareGrades === true -> gradesSummary MUST be included
  useSettings.getState().setWhaleShareGrades(true);
  const snapEnabled = aiMod.buildLiveSnapshotFromCtx(ctx, sundayNow);
  assert.ok(snapEnabled.gradesSummary && snapEnabled.gradesSummary.includes("总GPA"));

  const examDueAt = new Date(2026, 11, 20, 9, 0, 0, 0).getTime();
  mockAiReturn = {
    reply: "记好啦，已经帮你建好高数期末考试待办！",
    actions: [
      {
        type: "add_task",
        task: {
          title: "高数期末",
          type: "exam",
          dueAt: examDueAt,
          reminder: 60,
          location: "教三204",
          seat: "15",
          examMode: "closed",
          course: { courseName: "高等数学" },
        },
      },
      // Malformed add_task entries MUST be safely dropped
      { type: "add_task", task: { title: "", type: "exam", dueAt: examDueAt, reminder: 60 } },
      { type: "add_task", task: { title: "非法类型", type: "party", dueAt: examDueAt, reminder: 60 } },
      { type: "add_task", task: { title: "非法时间", type: "homework", dueAt: "not-a-date", reminder: 15 } },
      { type: "add_task", task: { title: "非法提醒", type: "homework", dueAt: examDueAt, reminder: 999 } },
      { type: "add_task", task: { title: "非法模式", type: "exam", dueAt: examDueAt, reminder: 60, examMode: "oral" } },
      { type: "add_task", task: null },
    ],
  };

  const aiResult = await aiMod.askAssistant(
    [{ role: "user", content: "记一下12月20号上午9点教三204高数期末闭卷考试" }],
    ctx,
    "mock-key",
  );
  assert.ok(
    capturedPrompts[capturedPrompts.length - 1].includes("成绩与绩点概况"),
    "system prompt must include grades when whaleShareGrades=true",
  );
  assert.equal(aiResult.actions.length, 1, "only valid sanitized add_task should survive");
  assert.equal(aiResult.actions[0].type, "add_task");
  assert.equal(aiResult.actions[0].task.title, "高数期末");
  assert.equal(aiResult.actions[0].task.location, "教三204");
  assert.equal(aiResult.actions[0].task.seat, "15");
  assert.equal(aiResult.actions[0].task.examMode, "closed");
  assert.deepEqual(aiResult.actions[0].task.course, {
    scheduleId: "sched-1",
    courseId: "c-math",
    courseName: "高等数学",
  });

  /* 4. whaleAgent manage_schedule native tool accepts valid add_task & rejects malformed */
  let agentTurnCount = 0;
  const agentEnv = makeEnv({
    "@/services/deepseek": {
      TEXT_MODEL: "mock-text",
      DeepSeekError: class DeepSeekError extends Error {},
      chatAgentTurn: async (messages, _key, opts) => {
        capturedAgentCalls.push({ messages, tools: opts.tools });
        agentTurnCount++;
        if (agentTurnCount === 1) {
          return {
            content: "",
            reasoningContent: "",
            sources: [],
            serverToolCalls: [],
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "manage_schedule",
                  arguments: JSON.stringify({
                    operations: [
                      {
                        type: "add_task",
                        task: {
                          title: "线代作业",
                          type: "homework",
                          dueAt: examDueAt,
                          reminder: 15,
                        },
                      },
                      {
                        type: "add_task",
                        task: { title: "坏数据", type: "invalid", dueAt: -1 },
                      },
                    ],
                  }),
                },
              },
            ],
          };
        }
        return {
          content: "已帮你准备好线代作业待办啦！",
          reasoningContent: "",
          sources: [],
          serverToolCalls: [],
          toolCalls: [],
        };
      },
    },
  });
  const whaleAgent = agentEnv.load("src/services/whaleAgent.ts");
  const agentRes = await whaleAgent.runWhaleAgent(
    [{ role: "user", content: "加个线代作业待办" }],
    "mock-key",
    {
      scheduleCtx: {
        schedule,
        weekIndex: 1,
        schedules: [{ id: schedule.id, name: schedule.name }],
      },
    },
  );
  const manageTool = capturedAgentCalls[0].tools.find((t) => t.function?.name === "manage_schedule");
  assert.ok(
    manageTool.function.parameters.properties.operations.items.properties.type.enum.includes("add_task"),
    "whaleAgent manage_schedule tool schema must include add_task",
  );
  assert.equal(agentRes.actions.length, 1);
  assert.equal(agentRes.actions[0].type, "add_task");
  assert.equal(agentRes.actions[0].task.title, "线代作业");

  /* 5. assistantSchedule preview / commit / undo for add_task */
  const assistantSchedule = appEnv.load("src/services/assistantSchedule.ts");
  const simpleExamTask = {
    title: "高数期末",
    type: "exam",
    dueAt: examDueAt,
    reminder: 60,
    location: "教三204",
  };
  const preview = assistantSchedule.previewScheduleActions(
    [{ type: "add_task", task: simpleExamTask }],
    schedule,
  );
  assert.equal(preview.hasChanges, true);
  assert.equal(
    preview.changes[0].result,
    "新增考试待办：高数期末（教三204 · 12月20日 09:00）",
  );
  assert.equal(useStore.getState().courseTasks.length, 0, "preview must not mutate store");

  assert.equal(assistantSchedule.commitSchedulePreview(preview), true);
  assert.equal(useStore.getState().courseTasks.length, 1);
  assert.equal(preview.addedTaskIds.length, 1);
  const committedTaskId = preview.addedTaskIds[0];
  assert.equal(useStore.getState().courseTasks[0].id, committedTaskId);
  assert.equal(useStore.getState().courseTasks[0].location, "教三204");

  // Guard against double-commit on pure add_task preview
  assert.equal(assistantSchedule.commitSchedulePreview(preview), false, "second commit on same preview must be rejected");
  assert.equal(useStore.getState().courseTasks.length, 1, "double-commit must not insert duplicate tasks");
  assert.deepEqual(preview.addedTaskIds, [committedTaskId], "double-commit must preserve recorded task IDs");

  assert.equal(assistantSchedule.undoSchedulePreview(preview), true);
  assert.equal(useStore.getState().courseTasks.length, 0, "undo must remove added task");
  assert.equal(assistantSchedule.useLastScheduleChange.getState().change, null);
  assert.equal(assistantSchedule.undoSchedulePreview(preview), false, "second undo must return false");

  // Mixed batch: add course + add_task -> commit & undo rollback BOTH
  const mixedPreview = assistantSchedule.previewScheduleActions(
    [
      {
        type: "add",
        course: {
          name: "概率论",
          teacher: "陈老师",
          classroom: "教二101",
          weekday: 3,
          startPeriod: 1,
          endPeriod: 2,
          weeks: [1, 2, 3],
          color: "violet",
        },
      },
      {
        type: "add_task",
        task: {
          title: "概率论复习",
          type: "review",
          dueAt: examDueAt,
          reminder: 1440,
          note: "刷近三年真题",
        },
      },
    ],
    schedule,
  );
  assert.equal(mixedPreview.hasChanges, true);
  assert.equal(assistantSchedule.commitSchedulePreview(mixedPreview), true);
  assert.equal(useStore.getState().schedules[0].courses.length, schedule.courses.length + 1);
  assert.equal(useStore.getState().courseTasks.length, 1);

  assert.equal(assistantSchedule.undoSchedulePreview(mixedPreview), true);
  assert.equal(useStore.getState().schedules[0].courses.length, schedule.courses.length);
  assert.equal(useStore.getState().courseTasks.length, 0);

  // Invalid add_task in preview must not mark hasChanges
  const invalidPreview = assistantSchedule.previewScheduleActions(
    [{ type: "add_task", task: { title: "", type: "exam", dueAt: -5, reminder: 60 } }],
    schedule,
  );
  assert.equal(invalidPreview.hasChanges, false);
  assert.match(invalidPreview.changes[0].result, /失败/);

  /* 6. UI wiring checks */
  const aiPetSettingsSrc = fs.readFileSync(path.join(root, "src/screens/settings/AiPetSettings.tsx"), "utf8");
  const reminderSettingsSrc = fs.readFileSync(path.join(root, "src/screens/settings/ReminderWidgetSettings.tsx"), "utf8");
  const whaleSettingsSrc = fs.readFileSync(path.join(root, "src/screens/WhaleSettingsScreen.tsx"), "utf8");
  assert.ok(aiPetSettingsSrc.includes("成绩感知"), "AiPetSettings AI entry subtitle must mention 成绩感知");
  assert.ok(whaleSettingsSrc.includes("允许大肥鱼参考成绩与空课"), "WhaleSettingsScreen must expose whaleShareGrades toggle");
  assert.ok(whaleSettingsSrc.includes("whaleShareGrades"), "WhaleSettingsScreen must bind whaleShareGrades");
  assert.ok(reminderSettingsSrc.includes("常驻上课进度通知"), "ReminderWidgetSettings must expose liveClassNotification toggle");
  assert.ok(reminderSettingsSrc.includes("liveClassNotification"), "ReminderWidgetSettings must bind liveClassNotification");
  assert.ok(reminderSettingsSrc.includes("ensureReminderPermission"), "ReminderWidgetSettings must request notification permission when enabling liveClassNotification");
  assert.ok(reminderSettingsSrc.includes("Linking.openSettings"), "ReminderWidgetSettings must offer Linking.openSettings fallback on permission denial");

  const assistantChatSrc = fs.readFileSync(path.join(root, "src/components/assistant/useAssistantChat.ts"), "utf8");
  const assistantWidgetsSrc = fs.readFileSync(path.join(root, "src/components/assistant/AssistantChatWidgets.tsx"), "utf8");
  assert.ok(assistantChatSrc.includes('"add_task"'), "useAssistantChat SCHEDULE_TYPES must include add_task");
  assert.ok(assistantWidgetsSrc.includes("预览新增待办"), "AssistantChatWidgets button label must handle add_task");

  const assistantMsgSrc = fs.readFileSync(path.join(root, "src/components/AssistantMessage.tsx"), "utf8");
  assert.ok(assistantMsgSrc.includes("预览新增待办"), "AssistantMessage button label must handle add_task");

  const whalePetHelpersSrc = fs.readFileSync(path.join(root, "src/components/whale/whalePetHelpers.ts"), "utf8");
  const whalePetStageSrc = fs.readFileSync(path.join(root, "src/components/whale/WhalePetStage.tsx"), "utf8");
  assert.ok(whalePetHelpersSrc.includes('"add_task"'), "whalePetHelpers SCHEDULE_TYPES must include add_task");
  assert.ok(
    whalePetStageSrc.includes("isScheduleAction") && whalePetStageSrc.includes("isWhaleAction"),
    "WhalePetStage must wire isScheduleAction/isWhaleAction from whalePetHelpers",
  );

  console.log(
    "Whale copilot checks passed: weekly free slots, GPA/grade priority summary, attendance redline alerts, recent focus summary, whaleContext live blocks, whaleShareGrades privacy gating, SecureStore partialize invariant, add_task sanitization/preview/commit/undo, and UI wiring.",
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

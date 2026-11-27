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
    multiGet: async (keys) => keys.map((k) => [k, disk.get(k) ?? null]),
    multiSet: async (rows) => {
      for (const [k, v] of rows) disk.set(k, v);
    },
    multiRemove: async (keys) => {
      for (const k of keys) disk.delete(k);
    },
  };

  const load = createLoader({
    "react-native": { Platform: { OS: "android" } },
    "@react-native-async-storage/async-storage": storage,
  });

  /* 1. studyProgress pure domain helpers */
  const progress = load("src/utils/studyProgress.ts");
  const {
    DEFAULT_PERIODS,
    DEFAULT_GRADE_RULES,
    DEFAULT_GRADE_TYPES,
    DEFAULT_GRADE_YEARS,
    SAMPLE_SCHEDULE,
  } = load("src/constants/sample.ts");

  const mathMon = {
    id: "c-math-mon",
    name: "  高等数学 A ",
    teacher: " 张老师 ",
    classroom: "A101",
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    color: "sky",
  };
  const mathWed = {
    id: "c-math-wed",
    name: "高等数学   a",
    teacher: "张老师",
    classroom: "A101",
    weekday: 3,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    color: "sky",
  };
  const shortLab = {
    id: "c-lab",
    name: "短学期实验",
    teacher: "李老师",
    classroom: "B202",
    weekday: 5,
    startPeriod: 3,
    endPeriod: 4,
    weeks: [1, 2, 3, 4],
    color: "emerald",
  };

  // courseIdentityKey normalizes spacing & case across weekly slots
  assert.equal(
    progress.courseIdentityKey(mathMon),
    progress.courseIdentityKey(mathWed),
  );
  assert.notEqual(
    progress.courseIdentityKey(mathMon),
    progress.courseIdentityKey(shortLab),
  );

  // computeAttendanceSummary: single slot 9 weeks -> default redline = max(2, floor(9/3)) = 3
  const baseAt = new Date(2026, 9, 12, 10, 0).getTime();
  const keyMath = progress.courseIdentityKey(mathMon);
  const mkRec = (id, status, offset = 0) => ({
    id,
    courseKey: keyMath,
    courseName: "高等数学 A",
    dateIso: "2026-10-12",
    status,
    at: baseAt + offset,
  });

  const safeSummary = progress.computeAttendanceSummary(mathMon, [
    mkRec("r1", "present"),
    mkRec("r2", "leave"),
    mkRec("r3", "absent"),
  ]);
  assert.equal(safeSummary.totalExpected, 9);
  assert.equal(safeSummary.redline, 3);
  assert.equal(safeSummary.present, 1);
  assert.equal(safeSummary.leave, 1);
  assert.equal(safeSummary.absent, 1);
  assert.equal(safeSummary.remainingBeforeRedline, 2);
  assert.equal(safeSummary.riskLevel, "safe");

  const warnSummary = progress.computeAttendanceSummary(mathMon, [
    mkRec("r1", "absent"),
    mkRec("r2", "absent"),
  ]);
  assert.equal(warnSummary.remainingBeforeRedline, 1);
  assert.equal(warnSummary.riskLevel, "warn");

  const dangerSummary = progress.computeAttendanceSummary(mathMon, [
    mkRec("r1", "absent"),
    mkRec("r2", "absent"),
    mkRec("r3", "absent"),
  ]);
  assert.equal(dangerSummary.remainingBeforeRedline, 0);
  assert.equal(dangerSummary.riskLevel, "danger");

  // Minimum redline floor = 2 for short 4-week course, and custom limit override works
  const shortDefault = progress.computeAttendanceSummary(shortLab, [
    mkRec("s1", "absent"),
  ]);
  assert.equal(shortDefault.redline, 2);
  assert.equal(shortDefault.riskLevel, "warn");

  const customOverride = progress.computeAttendanceSummary(
    mathMon,
    [mkRec("r1", "absent")],
    1,
  );
  assert.equal(customOverride.redline, 1);
  assert.equal(customOverride.remainingBeforeRedline, 0);
  assert.equal(customOverride.riskLevel, "danger");

  // Multi-slot course sums expected sessions across weekly slots (9 + 9 = 18 -> redline 6)
  const multiSlotSummary = progress.computeAttendanceSummary(
    [mathMon, mathWed],
    [],
  );
  assert.equal(multiSlotSummary.totalExpected, 18);
  assert.equal(multiSlotSummary.redline, 6);

  // Reward builders
  const r15 = progress.buildFarmRewardForFocus(15, "高等数学", baseAt);
  const r25 = progress.buildFarmRewardForFocus(25, "高等数学", baseAt);
  const r45 = progress.buildFarmRewardForFocus(45, "高等数学", baseAt);
  assert.equal(r15.coins, 18);
  assert.equal(r15.growthBoostMin, 15);
  assert.equal(r15.source, "focus");
  assert.equal(r25.coins, 32);
  assert.equal(r25.growthBoostMin, 25);
  assert.equal(r45.coins, 60);
  assert.equal(r45.growthBoostMin, 45);

  const hwReward = progress.buildFarmRewardForTask("homework", "第三章习题", baseAt);
  const revReward = progress.buildFarmRewardForTask("review", "期中复习", baseAt);
  const examReward = progress.buildFarmRewardForTask("exam", "高数期末", baseAt);
  assert.equal(hwReward.coins, 15);
  assert.equal(hwReward.source, "task");
  assert.equal(revReward.coins, 20);
  assert.equal(revReward.source, "task");
  assert.equal(examReward.coins, 50);
  assert.equal(examReward.source, "exam");

  /* 2. useStudyProgress Zustand store & atomic reward claiming */
  const { useStudyProgress } = load("src/store/useStudyProgress.ts");
  await useStudyProgress.persist.rehydrate();

  const att1 = useStudyProgress
    .getState()
    .recordAttendance(mathMon, "present", { dateIso: "2026-10-12", at: baseAt });
  const att2 = useStudyProgress
    .getState()
    .recordAttendance(mathWed, "absent", { dateIso: "2026-10-14", at: baseAt + 1000 });
  assert.equal(
    useStudyProgress.getState().attendanceByCourse[keyMath].length,
    2,
    "different weekly slots of the same course share one attendance bucket",
  );
  useStudyProgress.getState().removeAttendanceRecord(keyMath, att1.id);
  assert.deepEqual(
    useStudyProgress.getState().attendanceByCourse[keyMath].map((r) => r.id),
    [att2.id],
  );

  useStudyProgress.getState().setCustomAbsenceLimit(keyMath, 4);
  assert.equal(useStudyProgress.getState().customAbsenceLimits[keyMath], 4);
  useStudyProgress.getState().setCustomAbsenceLimit(keyMath, null);
  assert.equal(useStudyProgress.getState().customAbsenceLimits[keyMath], undefined);

  const focusRes = useStudyProgress
    .getState()
    .recordCourseFocus(mathMon, 25, { at: baseAt });
  assert.equal(focusRes.log.minutes, 25);
  assert.equal(focusRes.reward.coins, 32);
  assert.equal(useStudyProgress.getState().focusLogs.length, 1);

  useStudyProgress.getState().queueTaskReward("homework", "线代习题", baseAt + 500);
  useStudyProgress.getState().queueTaskReward("exam", "高数期中", baseAt + 900);
  assert.equal(useStudyProgress.getState().pendingFarmRewards.length, 3);

  // Atomic claimPendingFarmRewards returns all pending and clears queue immediately
  const claimed = useStudyProgress.getState().claimPendingFarmRewards();
  assert.equal(claimed.length, 3);
  assert.equal(useStudyProgress.getState().pendingFarmRewards.length, 0);
  assert.deepEqual(
    useStudyProgress.getState().claimPendingFarmRewards(),
    [],
    "second claim cannot pay twice",
  );

  /* 3. farmStudyLink enhanced summary & reward settlement */
  const farmStudyLink = load("src/utils/farmStudyLink.ts");
  const sampleSchedule = {
    ...SAMPLE_SCHEDULE,
    startDate: "2026-10-12",
    endDate: "2027-01-10",
    totalWeeks: 14,
    periods: DEFAULT_PERIODS,
    courses: [mathMon, mathWed, shortLab],
  };

  // Backward-compatible 4-arg call
  const legacyCtx = farmStudyLink.summarizeStudyDay(sampleSchedule, [], baseAt, true);
  assert.equal(legacyCtx.enabled, true);
  assert.equal(legacyCtx.todayCourseCount, 1);
  assert.equal("todayFocusMinutes" in legacyCtx, false);

  // Enhanced 5-arg call celebrates focus & gently warns attendance without leaking course name
  const richCtx = farmStudyLink.summarizeStudyDay(
    sampleSchedule,
    [],
    baseAt,
    true,
    {
      todayFocusMinutes: 50,
      attendanceDangerCourses: ["高等数学 A"],
      pendingRewardCount: 2,
    },
  );
  assert.equal(richCtx.todayFocusMinutes, 50);
  assert.equal(richCtx.attendanceDangerCount, 1);
  assert.equal(richCtx.pendingRewardCount, 2);
  assert.match(richCtx.brief, /50 分钟/);
  assert.match(richCtx.brief, /1 门课考勤接近红线/);
  assert.match(richCtx.gazetteNote, /50 分钟/);
  assert.match(richCtx.gazetteNote, /缺勤红线/);
  assert.ok(
    !richCtx.brief.includes("高等数学") && !richCtx.gazetteNote.includes("高等数学"),
    "farm study summary keeps course names private",
  );

  // Settlement math
  const settlement = farmStudyLink.applyPendingRewardsToFarmCoins(100, claimed);
  assert.equal(settlement.totalCoins, 32 + 15 + 50);
  assert.equal(settlement.nextCoins, 197);
  assert.equal(settlement.totalGrowthMin, 25 + 10 + 40);
  assert.match(settlement.summary, /\+97 dark币/);
  const emptySettle = farmStudyLink.applyPendingRewardsToFarmCoins(100, []);
  assert.equal(emptySettle.nextCoins, 100);
  assert.equal(emptySettle.totalCoins, 0);
  assert.equal(emptySettle.summary, "");

  /* 4. backup.ts validation for week widget mode, new settings booleans, study progress & peer schedules */
  const backup = load("src/utils/backup.ts");
  assert.ok(backup.BACKUP_KEYS.includes("dark-study-study-progress"));
  assert.ok(backup.BACKUP_KEYS.includes("dark-study-peer-schedules"));

  const mainData = {
    version: 6,
    state: {
      schedules: [sampleSchedule],
      activeScheduleId: sampleSchedule.id,
      grades: [],
      gradeYears: DEFAULT_GRADE_YEARS,
      activeGradeYearId: DEFAULT_GRADE_YEARS[0].id,
      gradeTypes: DEFAULT_GRADE_TYPES,
      gradeRules: DEFAULT_GRADE_RULES,
      activeGradeRuleId: DEFAULT_GRADE_RULES[0].id,
      activeGradeSemester: "fall",
    },
  };
  const studyProgressPayload = {
    version: 0,
    state: {
      attendanceByCourse: {
        [keyMath]: [att2],
      },
      customAbsenceLimits: {
        [keyMath]: 4,
      },
      focusLogs: [focusRes.log],
      pendingFarmRewards: [r25],
    },
  };
  const peerSchedulesPayload = {
    version: 0,
    state: {
      peers: [
        {
          id: "peer-1",
          nickname: "室友A",
          color: "violet",
          scheduleName: "大二上",
          totalWeeks: 16,
          startDate: "2026-09-07",
          active: true,
          importedAt: baseAt,
          courses: [
            { n: "线性代数", d: 2, s: 1, e: 2, w: [1, 2, 3], r: "B102" },
          ],
        },
      ],
    },
  };

  const created = backup.createBackup([
    ["dark-study-storage", JSON.stringify(mainData)],
    [
      "dark-study-settings",
      JSON.stringify({
        version: 0,
        state: {
          appearance: "dark",
          whaleShareGrades: false,
          liveClassNotification: true,
        },
      }),
    ],
    [
      "dark-study-widget-settings",
      JSON.stringify({
        version: 0,
        state: { shape: "large", theme: "dark", style: "frosted", mode: "week", count: 4 },
      }),
    ],
    ["dark-study-study-progress", JSON.stringify(studyProgressPayload)],
    ["dark-study-peer-schedules", JSON.stringify(peerSchedulesPayload)],
  ]);

  assert.equal(created.data["dark-study-widget-settings"].state.mode, "week");
  assert.equal(created.data["dark-study-settings"].state.whaleShareGrades, false);
  assert.equal(created.data["dark-study-settings"].state.liveClassNotification, true);
  assert.equal(created.data["dark-study-study-progress"].state.focusLogs.length, 1);
  assert.equal(created.data["dark-study-peer-schedules"].state.peers.length, 1);

  // Merge restore unions study progress & peer schedules cleanly
  const existingStudy = structuredClone(studyProgressPayload);
  existingStudy.state.focusLogs = [
    {
      id: "foc-local-1",
      courseKey: keyMath,
      courseName: "高等数学 A",
      minutes: 15,
      coinsAwarded: 18,
      at: baseAt + 5000,
    },
  ];
  const existingPeers = {
    version: 0,
    state: {
      peers: [
        {
          id: "peer-local",
          nickname: "对象",
          color: "rose",
          scheduleName: "外语系",
          totalWeeks: 16,
          startDate: "2026-09-07",
          active: true,
          importedAt: baseAt,
          courses: [{ n: "综合英语", d: 1, s: 3, e: 4, w: [1, 2] }],
        },
      ],
    },
  };
  const mergePlan = new Map(
    backup.buildRestorePlan(
      created,
      [
        ["dark-study-study-progress", JSON.stringify(existingStudy)],
        ["dark-study-peer-schedules", JSON.stringify(existingPeers)],
      ],
      "merge",
    ),
  );
  assert.equal(
    JSON.parse(mergePlan.get("dark-study-study-progress")).state.focusLogs.length,
    2,
  );
  assert.equal(
    JSON.parse(mergePlan.get("dark-study-peer-schedules")).state.peers.length,
    2,
  );

  // Backward compatibility: old backup lacking study-progress, peer-schedules & new booleans parses cleanly
  const legacyBackup = structuredClone(created);
  delete legacyBackup.data["dark-study-study-progress"];
  delete legacyBackup.data["dark-study-peer-schedules"];
  delete legacyBackup.data["dark-study-settings"].state.whaleShareGrades;
  delete legacyBackup.data["dark-study-settings"].state.liveClassNotification;
  const parsedLegacy = backup.parseBackup(JSON.stringify(legacyBackup));
  assert.equal("dark-study-study-progress" in parsedLegacy.data, false);

  // Reject invalid new fields
  const badBool = structuredClone(created);
  badBool.data["dark-study-settings"].state.whaleShareGrades = "yes";
  assert.throws(() => backup.parseBackup(JSON.stringify(badBool)), /偏好设置/);

  const badAtt = structuredClone(created);
  badAtt.data["dark-study-study-progress"].state.attendanceByCourse[keyMath][0].status = "skipped";
  assert.throws(() => backup.parseBackup(JSON.stringify(badAtt)), /考勤记录/);

  const badPeer = structuredClone(created);
  badPeer.data["dark-study-peer-schedules"].state.peers[0].courses[0].d = 9;
  assert.throws(() => backup.parseBackup(JSON.stringify(badPeer)), /好友课表/);

  /* 5. backupStorage.ts end-to-end rehydration & collection for useStudyProgress & usePeerSchedules */
  const secureStore = new Map();
  const integrationDisk = new Map();
  const integrationStorage = {
    getItem: async (key) => integrationDisk.get(key) ?? null,
    setItem: async (key, value) => {
      integrationDisk.set(key, value);
    },
    removeItem: async (key) => {
      integrationDisk.delete(key);
    },
    multiGet: async (keys) => keys.map((k) => [k, integrationDisk.get(k) ?? null]),
    multiSet: async (rows) => {
      for (const [k, v] of rows) integrationDisk.set(k, v);
    },
    multiRemove: async (keys) => {
      for (const k of keys) integrationDisk.delete(k);
    },
  };
  integrationDisk.set("dark-study-storage", JSON.stringify(mainData));
  const integrationLoad = createLoader({
    "@react-native-async-storage/async-storage": integrationStorage,
    "react-native": { Platform: { OS: "android" } },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key) => secureStore.get(key) ?? null,
      setItemAsync: async (key, value) => {
        secureStore.set(key, value);
      },
      deleteItemAsync: async (key) => {
        secureStore.delete(key);
      },
    },
  });
  const backupSvc = integrationLoad("src/services/backupStorage.ts");
  await backupSvc.hydrateBackupStores();
  await backupSvc.restoreBackup(created, "replace");
  const restoredStudy = integrationLoad("src/store/useStudyProgress.ts").useStudyProgress.getState();
  const restoredPeers = integrationLoad("src/store/usePeerSchedules.ts").usePeerSchedules.getState();
  assert.equal(restoredStudy.focusLogs.length, 1);
  assert.equal(restoredStudy.customAbsenceLimits[keyMath], 4);
  assert.equal(restoredPeers.peers.length, 1);
  assert.equal(restoredPeers.peers[0].nickname, "室友A");
  const reCollected = await backupSvc.collectBackup();
  assert.equal(reCollected.data["dark-study-study-progress"].state.focusLogs.length, 1);
  assert.equal(reCollected.data["dark-study-peer-schedules"].state.peers.length, 1);

  console.log(
    "PASS: studyProgress redline/rewards, useStudyProgress atomic claims, farmStudyLink progress & coin settlement, and backup/rehydration of P2 modules & settings",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

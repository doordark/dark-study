const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map(), disk = new Map(), intents = [], scheduled = [], cancelled = [];
const mocks = {
  "react-native": { Platform: { OS: "android" } },
  "@react-native-async-storage/async-storage": {
    getItem: async k => disk.get(k) ?? null, setItem: async (k,v) => disk.set(k,v), removeItem: async k => disk.delete(k),
  },
  "expo-intent-launcher": { startActivityAsync: async (...args) => { intents.push(args); } },
  "expo-notifications": {
    setNotificationHandler() {}, AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: "date" },
    getAllScheduledNotificationsAsync: async () => [
      { identifier: "old", content: { data: { kind: "dark-study-course-reminder" } } },
      { identifier: "legacy-task", content: { data: { kind: "dark-study-course-task" } } },
      { identifier: "other", content: { data: {} } },
    ],
    cancelScheduledNotificationAsync: async id => cancelled.push(id), getPermissionsAsync: async () => ({ granted: true }),
    setNotificationChannelAsync: async () => {}, scheduleNotificationAsync: async data => scheduled.push(data),
  },
};
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require","module","exports",compiled)(name => {
    if (Object.hasOwn(mocks,name)) return mocks[name];
    if (name.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), name),"utf8"));
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts')));
    return name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name);
  },mod,mod.exports);
  return mod.exports;
}
async function run() {
  const { useStore: store } = load("src/store/useStore.ts");
  await store.persist.rehydrate();
  const periods = [
    { index:1,label:"第1节",startTime:"08:00",endTime:"08:45" },
    { index:2,label:"第2节",startTime:"08:55",endTime:"09:40" },
    { index:3,label:"第3节",startTime:"09:50",endTime:"10:40" },
    { index:4,label:"第4节",startTime:"10:50",endTime:"11:35" },
  ];
  const course = { id:"ds",name:"数据结构",teacher:"李老师",classroom:"A1",weekday:3,startPeriod:1,endPeriod:2,weeks:[7,8,9],color:"sky" };
  const schedule = { id:"term",name:"测试学期",kind:"fall",startDate:"2026-09-07",endDate:"2026-12-27",totalWeeks:16,periods,courses:[course,{ ...course,id:"ds-mon",weekday:1 }] };
  const reset = () => store.setState({ schedules:[structuredClone(schedule)],activeScheduleId:"term" });
  const current = () => store.getState().schedules[0];
  const importedCourse = { ...course, startPeriod: 6, endPeriod: 7, weeks: [7, 8, 17, 18] };
  store.setState({ schedules: [{ ...schedule, courses: [importedCourse, schedule.courses[1]] }], activeScheduleId: "term" });
  store.getState().updateCourse("ds", { ...importedCourse, classroom: "C406" });
  assert.deepEqual(current().courses[0], { ...importedCourse, classroom: "C406" });
  assert.equal(current().courses[1].classroom, "C406");
  // Explicitly clearing a shared optional field (credits: undefined) propagates to sibling records.
  store.getState().updateCourse("ds", { credits: 4 });
  assert.equal(current().courses[1].credits, 4);
  store.getState().updateCourse("ds", { credits: undefined });
  assert.equal(current().courses[1].credits, undefined);
  assert.throws(() => store.getState().updateCourse("ds", { endPeriod: 9 }), /节次/);
  assert.throws(() => store.getState().updateCourse("ds", { weeks: [7, 19] }), /周次/);
  const { applyScheduleActions: apply } = load("src/services/assistantSchedule.ts");
  const { previewScheduleActions, commitSchedulePreview, undoSchedulePreview } = load("src/services/assistantSchedule.ts");
  reset();
  const move = { type:"update",courseId:"ds",targetWeeks:[8],patch:{ weekday:1 } };
  const missing = { type:"remove",courseId:"missing",courseName:"不存在的课程" };
  const unchanged = current();
  const preview = previewScheduleActions([move, missing], current());
  assert.equal(current(), unchanged);
  assert(preview.changes[0].details.some(line => line.includes("时间冲突")));
  assert.match(preview.changes[1].result, /未找到/);
  assert(commitSchedulePreview(preview));
  assert(!commitSchedulePreview(preview), "the same preview cannot be applied twice");
  assert(undoSchedulePreview(preview));
  assert.equal(current(), unchanged);
  store.getState().updateCourse("ds", { classroom:"B2" });
  assert(!commitSchedulePreview(preview), "a stale preview must not overwrite manual edits");
  const secondPreview = previewScheduleActions([move], current());
  assert(commitSchedulePreview(secondPreview));
  store.getState().updateCourse("ds", { teacher:"王老师" });
  assert(!undoSchedulePreview(secondPreview), "undo must preserve later manual edits");
  assert.equal(current().courses.find(c => c.id === "ds").teacher, "王老师");
  reset();
  const other = { ...schedule, id: "other", name: "另一张课表" };
  store.setState(state => ({ schedules: [...state.schedules, other] }));
  const afterClose = previewScheduleActions([move], current());
  assert(commitSchedulePreview(afterClose));
  store.setState({ activeScheduleId: "other" });
  store.getState().updateCourse("ds", { classroom: "C3" });
  assert(undoSchedulePreview(afterClose));
  assert.equal(store.getState().activeScheduleId, "other");
  assert.equal(store.getState().schedules.find(s => s.id === "other").courses.find(c => c.id === "ds").classroom, "C3");
  assert.deepEqual(current(), schedule);
  reset();
  const result = apply([{ type:"update",courseId:"ds",courseName:"数据结构",targetWeeks:[8],targetWeekday:3,patch:{ startTime:"08:00",endTime:"10:40" } }],current());
  assert.match(result[0],/第8周/);
  const changed = current().courses.find(c => c.id !== "ds" && c.weekday === 3);
  assert.deepEqual(changed.weeks,[8]); assert.equal(changed.startPeriod,1); assert.equal(changed.endPeriod,3);
  assert.equal(changed.endTime,"10:40");
  assert.deepEqual(current().courses.find(c => c.id === "ds").weeks,[7,9]);
  assert.equal(current().courses.find(c => c.id === "ds").endPeriod,2);
  assert.equal(current().courses.find(c => c.id === "ds-mon").endPeriod,2);
  // State survives persistence including exact-time fields and split weeks.
  await new Promise(r => setImmediate(r));
  await store.persist.rehydrate();
  assert.equal(current().courses.find(c => c.id === changed.id).endTime,"10:40");
  const time = load("src/utils/time.ts");
  assert.equal(time.getCourseTime(periods,1,3,changed).endTime,"10:40");
  // Missing period index must still compute startMinutes/endMinutes from valid exact overrides.
  assert.equal(time.getCourseTime(periods, 99, 99, { startTime: "08:15", endTime: "09:45" }).startMinutes, 495);
  assert.equal(time.getCourseTime(periods, 99, 99, { startTime: "08:15", endTime: "09:45" }).durationMinutes, 90);
  assert.equal(time.normalizeClockInput("8:30"), "08:30");
  assert.equal(time.normalizeClockInput("9：05"), "09:05");
  assert.equal(time.countDistinctCourses([course, { ...course, id: "ds-mon", weekday: 1 }]), 1);
  assert.equal(time.countPeriodSlots([course, { ...course, id: "ds-mon", weekday: 1 }]), 4);
  assert.equal(time.formatWeeksCompact([1, 2, 3, 4]), "1–4周");
  assert.equal(time.formatWeeksCompact([1, 3, 5, 7]), "1–7单周");
  assert.equal(time.formatWeeksCompact([2, 4, 6]), "2–6双周");
  assert.equal(time.getSemesterStatus(schedule, new Date("2026-09-01T12:00:00")).phase, "before");
  assert.equal(time.getSemesterStatus(schedule, new Date("2026-10-15T12:00:00")).phase, "active");
  assert.equal(time.getSemesterStatus(schedule, new Date("2027-01-15T12:00:00")).phase, "after");
  // Schedule duplication, active clear and cross-schedule period sync.
  const copyId = store.getState().duplicateSchedule("term");
  assert(copyId && store.getState().activeScheduleId === copyId);
  assert.equal(store.getState().schedules.find(s => s.id === copyId).courses.length, current().courses.length);
  store.getState().clearActiveCourses();
  assert.equal(store.getState().schedules.find(s => s.id === copyId).courses.length, 0);
  store.getState().setActiveSchedule("term");
  const syncRes = store.getState().applyPeriodsToAllSchedules();
  assert.equal(syncRes.updated, 1);
  store.getState().removeSchedule(copyId);
  const { upcomingWidgetCourses: upcoming } = load("src/utils/courseWidget.ts");
  const rows = upcoming(current(),new Date("2026-10-26T00:00:00"));
  assert(rows.some(r => r.id.startsWith(changed.id) && r.time === "08:00–10:40"));
  const reminders = load("src/services/courseReminders.ts");
  const { planCourseException } = load("src/utils/courseEditing.ts");
  const { courseDeletionRows } = load("src/utils/courseEditing.ts");
  const stopped = planCourseException(schedule, course, { type:"cancel", week:8 }, "unused");
  assert.equal(stopped.beforeDate, "2026-10-28");
  assert.deepEqual(stopped.schedule.courses.find(row => row.id === "ds").weeks, [7,9]);
  const exception = { type:"move", week:8, date:"2026-10-26", startPeriod:1, endPeriod:2, classroom:"B2" };
  const relocated = planCourseException(schedule, course, exception, "relocated");
  assert.deepEqual(relocated.schedule.courses.find(row => row.id === "relocated").weeks, [8]);
  assert.equal(relocated.after.date, "2026-10-26");
  assert.deepEqual(relocated.conflicts, ["数据结构"]);
  const extra = planCourseException(schedule, course, { ...exception, type:"extra", date:"2026-10-30" }, "extra");
  assert.deepEqual(extra.schedule.courses.find(row => row.id === "ds").weeks, [7,8,9]);
  assert.equal(extra.schedule.courses.find(row => row.id === "extra").weekday, 5);
  const beforeException = new Date(2026, 9, 26);
  const scheduledAfterMove = reminders.buildCourseReminders(relocated.schedule, 15, 1, beforeException);
  assert(!scheduledAfterMove.some(item => item.date.getDate() === 28));
  const scheduledAfterExtra = reminders.buildCourseReminders(extra.schedule, 15, 1, beforeException);
  assert(scheduledAfterExtra.some(item => item.date.getMonth() === 9 && item.date.getDate() === 30));
  assert.throws(() => planCourseException(schedule, course, { ...exception, date:"2026-11-31" }, "invalid"), /有效日期/);
  assert.deepEqual(course.weeks, [7,8,9]);
  // Date-specific move, with a non-boundary precise time, reaches reminders and widgets.
  store.getState().updateCourse(changed.id,{ weekday:4,startTime:"08:10",endTime:"10:30" },[8]);
  const moved = current().courses.find(c => c.id === changed.id);
  assert.equal(moved.startPeriod,1); assert.equal(moved.endPeriod,3);
  const plan = reminders.buildCourseReminders(current(),15,2,new Date("2026-10-26T00:00:00"));
  assert(plan.some(r => r.date.getDate() === 29 && r.date.getHours() === 7 && r.date.getMinutes() === 55));
  const updatedRows = upcoming(current(),new Date("2026-10-26T00:00:00"));
  const movedRow = updatedRows.find(r => r.id.startsWith(changed.id));
  assert.equal(movedRow.time,"08:10–10:30");
  // Invalid updates fail atomically, and ambiguous names do not select the first record.
  const before = JSON.stringify(current());
  assert.match(apply([{ type:"update",courseId:"bad",courseName:"数据结构",patch:{ endPeriod:4 } }],current())[0],/不唯一/);
  assert.match(apply([{ type:"update",courseId:"ds",targetWeeks:[99],patch:{ endPeriod:4 } }],current())[0],/不存在/);
  assert.match(apply([{ type:"update",courseId:"ds",targetWeeks:[7],patch:{ startTime:"25:00",endTime:"26:00" } }],current())[0],/失败/);
  assert.match(apply([{ type:"update",courseId:"ds",targetWeeks:[],patch:{} }],current())[0],/失败/);
  assert.equal(JSON.stringify(current()),before);
  assert.throws(() => store.getState().updateCourse("ds",{ weeks:[] }),/周次/);
  assert.throws(() => store.getState().setPeriods(periods.slice(0,2)),/不能删除/);
  assert.throws(() => store.getState().setPeriods([{ ...periods[0],endTime:"07:00" }]),/晚于/);
  assert.throws(() => store.getState().setPeriods([periods[0],{ ...periods[1],startTime:"08:30" }]),/重叠/);
  assert.equal(JSON.stringify(current()),before);
  // Changing periods clears old overrides, and ordinary courses follow edited bell times.
  store.getState().updateCourse(changed.id,{ startPeriod:2,endPeriod:4 },[8]);
  assert.equal(current().courses.find(c => c.id === changed.id).startTime,undefined);
  store.getState().setPeriods(periods.map(p => p.index === 1 ? { ...p,startTime:"07:50" } : p));
  assert.equal(time.getCourseTime(current().periods,1,2).startTime,"07:50");
  // Alarm and calendar intents receive real lesson dates/times; distant alarms are rejected.
  const system = load("src/services/systemCourseReminders.ts");
  await system.openCourseCalendar(movedRow,15);
  assert.equal(intents[0][0],"android.intent.action.INSERT");
  assert.equal(intents[0][1].extra.beginTime,movedRow.start);
  assert.equal(intents[0][1].extra.endTime,movedRow.end);
  await system.openCourseAlarm(movedRow,15,new Date("2026-10-29T06:00:00"));
  assert.equal(intents[1][1].extra["android.intent.extra.alarm.HOUR"],7);
  assert.equal(intents[1][1].extra["android.intent.extra.alarm.MINUTES"],55);
  await assert.rejects(system.openCourseAlarm(movedRow,15,new Date("2026-10-26T00:00:00")),/24/);
  // Range deletion removes only selected teaching weeks and never sibling records.
  reset();
  const selected = current().courses[0];
  assert.deepEqual(courseDeletionRows(current(), selected, [8]).map(row => [row.id, row.weeks]), [["ds", [8]]]);
  assert.deepEqual(courseDeletionRows(current(), selected).map(row => [row.id, row.weeks]),
    [["ds", [7, 8, 9]], ["ds-mon", [7, 8, 9]]]);
  store.getState().removeCourseOnce("ds", [8]);
  assert.deepEqual(current().courses.find(c => c.id === "ds").weeks, [7,9]);
  assert.deepEqual(current().courses.find(c => c.id === "ds-mon").weeks, [7,8,9]);
  const beforeInvalidDelete = JSON.stringify(current());
  assert.throws(() => store.getState().removeCourseOnce("ds", []), /周次/);
  assert.throws(() => store.getState().removeCourseOnce("ds", [8]), /周次/);
  assert.equal(JSON.stringify(current()), beforeInvalidDelete);
  store.getState().removeCourseOnce("ds", [7,9]);
  assert.deepEqual(current().courses.map(c => c.id), ["ds-mon"]);
  reset();
  store.getState().removeCourse("ds");
  assert.equal(current().courses.length, 0);
  reset();
  store.getState().removeCourseOnce("ds");
  assert.deepEqual(current().courses.map(c => c.id), ["ds-mon"]);
  await reminders.syncCourseReminders(current(), true, 15, 1);
  assert.deepEqual(cancelled, ["old", "legacy-task"]); // Unrelated scheduled notifications remain intact.
  assert(scheduled.every(item => item.content.data.kind === "dark-study-course-reminder"));
  // New-course path must map exact times too.
  reset();
  const newId = store.getState().addCourse({ ...course,startTime:"08:00",endTime:"10:40" });
  assert.equal(current().courses.find(c => c.id === newId).endPeriod,3);
  // Precise ranges sharing a period can be adjacent without a conflict.
  assert.equal(time.findConflicts([{ ...course,startTime:"08:00",endTime:"08:15" },{ ...course,id:"b",startTime:"08:15",endTime:"08:30" }],7,periods).size,0);
  // Both conversational surfaces preserve the scoped operation schema and receive matching guidance.
  const prompts = [];
  mocks["@/services/deepseek"] = { TEXT_MODEL:"mock", chatJson:async messages => {
    prompts.push(messages[0].content);
    return { reply:"只修改第八周周三", actions:[{ type:"update", courseId:"ds", courseName:"数据结构", targetWeeks:[8], targetWeekday:3, patch:{ startTime:"08:00", endTime:"10:40" } }] };
  } };
  mocks["@/services/offlineImport"] = {};
  mocks["@/services/whaleContext"] = {
    createWhaleContext: history => ({ prompt:"测试角色", history, remember:()=>{} }),
    formatTimeContext: () => "2026-10-28 周三 09:00（上午）",
  };
  mocks["@/services/whaleReflection"] = { maybeScheduleWhaleReflection: () => {} };
  mocks["@/utils/whaleMemory"] = { recentWhaleHistory: history => history };
  mocks["@/utils/whalePersona"] = { buildWhalePersonaPrompt:()=>"测试角色", renderPersonaText:v=>v };
  mocks["@/store/useWhalePersona"] = { useWhalePersona:{ getState:()=>({ persona:{} }) } };
  const ai = load("src/services/ai.ts");
  const ctx = { schedule, schedules:[schedule], weekIndex:8 };
  const history = [{ role:"user", content:"把第八周星期三的数据结构改成从8点到10点40" }];
  for (const response of [await ai.askAssistant(history,ctx,"mock"), await ai.askAssistant(history,{ ...ctx,persona:"whale" },"mock"), await ai.askWhalePet(history,"mock",{ ctx })]) {
    assert.deepEqual(response.actions[0].targetWeeks,[8]);
    reset();
    apply(response.actions,current());
    assert.equal(current().courses.find(c => c.weekday === 3 && c.weeks.length === 1 && c.weeks[0] === 8).endPeriod,3);
  }
  assert.equal(prompts.length,3);
  for (const prompt of prompts) { assert.match(prompt,/targetWeeks/); assert.match(prompt,/startTime\/endTime/); assert.match(prompt,/10:40/); }
  console.log("PASS: scoped edits, persistence, AI action execution, precise times, periods, reminders, widgets and system intents");
}
run().catch(e => { console.error(e); process.exitCode = 1; });

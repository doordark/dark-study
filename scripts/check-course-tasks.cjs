const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

const disk = new Map();
const notifications = new Map([["unrelated", { content: { data: { kind: "another-feature" } } }]]);
let sequence = 0;
const load = createLoader({
  "react-native": { Platform: { OS: "android" } },
  "@react-native-async-storage/async-storage": {
    getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => disk.set(key, value),
    removeItem: async key => disk.delete(key),
  },
  "expo-notifications": {
    setNotificationHandler() {},
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    getAllScheduledNotificationsAsync: async () => [...notifications.values()],
    getPermissionsAsync: async () => ({ granted: true }),
    setNotificationChannelAsync: async () => {},
    cancelScheduledNotificationAsync: async id => notifications.delete(id),
    scheduleNotificationAsync: async item => {
      const identifier = String(++sequence);
      notifications.set(identifier, { ...item, identifier });
      return identifier;
    },
  },
});

async function run() {
  const { taskDueTime, nextCourse, todayTasks, weekAgenda } = load("src/utils/courseTasks.ts");
  const { useStore } = load("src/store/useStore.ts");
  const { buildTaskReminders, syncCourseReminders } = load("src/services/courseReminders.ts");
  const { addDays, mondayOf, toIsoDate } = load("src/utils/time.ts");
  const { planCourseException } = load("src/utils/courseEditing.ts");
  const { commitCourseException, undoSchedulePreview, useLastScheduleChange } = load("src/services/assistantSchedule.ts");
  const start = new Date(2026, 10, 16, 10);
  assert.equal(taskDueTime("2026-02-29", "08:30"), null);
  assert.equal(taskDueTime("2026-11-16", "24:00"), null);
  assert.equal(taskDueTime("2026-11-16", "10:00"), start.getTime());
  const sample = useStore.getState().schedules[0];
  const course = { ...sample.courses[0], weekday: 1, weeks: [1, 2], startTime: "09:45", endTime: "10:30", startPeriod: 1, endPeriod: 2 };
  const schedule = { ...sample, startDate: "2026-11-16", endDate: "2026-11-29", totalWeeks: 2, courses: [course] };
  const upcoming = nextCourse(schedule, start);
  assert.equal(toIsoDate(upcoming.date), "2026-11-23");
  assert.equal(upcoming.time, "09:45");
  assert.equal(nextCourse(schedule, new Date(2026, 10, 30)), undefined);
  await useStore.persist.rehydrate();
  const future = Date.now() + 3_600_000;
  const draft = { title: "讲义作业", type: "homework", dueAt: future, reminder: 15,
    course: { scheduleId: schedule.id, courseId: course.id, courseName: course.name } };
  useStore.getState().saveCourseTask(draft);
  const [homework] = useStore.getState().courseTasks;
  const earlier = { ...homework, id: "earlier", dueAt: start.getTime() - 1 };
  const exam = { ...homework, id: "exam", type: "exam", dueAt: new Date(2026, 10, 18, 13).getTime() };
  assert.deepEqual(todayTasks([earlier, exam, { ...earlier, id: "completed", completedAt: 1 }], start), { due: [earlier], exam });
  const week = weekAgenda(schedule, [earlier, exam, { ...exam, id: "completed", completedAt: 1 }], start);
  assert.equal(week.length, 7);
  assert.equal(week[0].data[0].start, "09:45");
  assert.equal(week[2].data[0].task.id, "exam");
  assert.equal(week.flatMap(day => day.data).length, 3, "same-day overdue tasks stay in the agenda, completed rows stay out");
  assert(!week.some(day => day.key === "2026-11-23"));
  assert.equal(buildTaskReminders([homework], new Date(future - 15 * 60000)).length, 0);
  await syncCourseReminders(undefined, false, 15, 1, [homework]);
  assert.equal(notifications.size, 2);
  const reminder = [...notifications.values()].find(row => row.content.data.kind === "dark-study-course-task");
  assert.equal(reminder.trigger.date.getTime(), future - 15 * 60000);
  await syncCourseReminders(undefined, false, 15, 1, [homework]);
  assert.equal(sequence, 1, "existing matching reminders are retained");
  useStore.getState().toggleCourseTask(homework.id);
  const tasks = useStore.getState().courseTasks;
  assert(tasks[0].completedAt);
  await syncCourseReminders(undefined, false, 15, 1, tasks);
  assert.deepEqual([...notifications.keys()], ["unrelated"]);
  await load("src/utils/coalescedWriter.ts").flushPendingWrites();
  await useStore.persist.rehydrate();
  assert.equal(useStore.getState().courseTasks[0].completedAt, tasks[0].completedAt);
  useStore.getState().removeCourseTask(homework.id);
  assert.equal(useStore.getState().courseTasks.length, 0);
  const futureDay = addDays(new Date(), 2);
  const futureMonday = mondayOf(futureDay);
  const moving = { ...course, weekday: futureDay.getDay() || 7, weeks: [1] };
  const term = { ...schedule, startDate: toIsoDate(futureMonday), endDate: toIsoDate(addDays(futureMonday, 13)), courses: [moving] };
  useStore.setState({ schedules: [term], activeScheduleId: term.id });
  await syncCourseReminders(term, true, 15, 1);
  const lessonTimes = () => [...notifications.values()].filter(item => item.content.data.kind === "dark-study-course-reminder").map(item => item.trigger.date.getTime());
  assert.deepEqual(lessonTimes(), [taskDueTime(toIsoDate(futureDay), "09:30")]);
  const movedDay = toIsoDate(addDays(futureDay, 1));
  const plan = planCourseException(term, moving, { type: "move", week: 1, date: movedDay, startPeriod: 1, endPeriod: 2, classroom: "A" }, "moved");
  assert(commitCourseException(plan, "临时调课"));
  await syncCourseReminders(plan.schedule, true, 15, 1);
  assert.deepEqual(lessonTimes(), [taskDueTime(movedDay, "09:30")]);
  const { change } = useLastScheduleChange.getState();
  assert(undoSchedulePreview(change));
  await syncCourseReminders(useStore.getState().schedules[0], true, 15, 1);
  assert.deepEqual(lessonTimes(), [taskDueTime(toIsoDate(futureDay), "09:30")]);
  assert(notifications.has("unrelated"));
  console.log("PASS: today dates, precise next class, task ordering and persistence, reminder reconciliation and cancellation");
}
run().catch(error => { console.error(error); process.exitCode = 1; });

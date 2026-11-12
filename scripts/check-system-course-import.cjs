const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const intents = [], events = [];
let granted = true, calendars = [], failEvent = false, failAlarm = false;
const calendar = {
  EntityTypes: { EVENT: 'event' }, CalendarAccessLevel: { OWNER: 'owner' }, SourceType: { LOCAL: 'local' },
  requestCalendarPermissionsAsync: async () => ({ granted }),
  getCalendarsAsync: async () => calendars,
  createCalendarAsync: async details => { calendars.push({ ...details, id: 'courses', allowsModifications: true }); return 'courses'; },
  getEventsAsync: async (_ids, start, end) => events.filter(e => +e.startDate < +end && +e.endDate > +start),
  createEventAsync: async (_id, details) => {
    if (failEvent && details.title === '失败项') throw Error('写入失败');
    const id = String(events.length); events.push({ ...details, id }); return id;
  },
  updateEventAsync: async (id, details) => Object.assign(events.find(e => e.id === id), details),
};
const source = fs.readFileSync('src/services/systemCourseReminders.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => {
  if (name === 'react-native') return { Platform: { OS: 'android' } };
  if (name === 'expo-calendar/legacy') return calendar;
  if (name === 'expo-intent-launcher') return { startActivityAsync: async (...args) => {
    if (failAlarm) throw Error('java.lang.SecurityException: requires com.android.alarm.permission.SET_ALARM');
    intents.push(args);
  } };
  throw Error(`Unexpected import: ${name}`);
}, mod, mod.exports);

async function run() {
  const api = mod.exports;
  const now = Date.now();
  const course = { id: 'a-date', name: '数据结构', teacher: '李老师', classroom: 'A1', start: now + 3600000, end: now + 7200000 };
  assert.equal(api.canImportAlarm(course, 15, now), true);
  assert.equal(api.canImportAlarm({ ...course, start: now + 15 * 60000 }, 15, now), false);
  assert.equal(api.canImportAlarm({ ...course, start: now + 86400000 + 15 * 60000 }, 15, now), false);
  const distant = { ...course, id: 'far', start: now + 3 * 86400000, end: now + 3 * 86400000 + 3600000 };
  let result = await api.importCourseAlarms([course, distant], 15);
  assert.deepEqual(result, { completed: 1, skipped: 1, failures: [] });
  assert.equal(intents[0][1].extra['android.intent.extra.alarm.SKIP_UI'], true);
  assert.equal(intents[0][1].extra['android.intent.extra.alarm.MINUTES'], new Date(course.start - 15 * 60000).getMinutes());
  failAlarm = true;
  result = await api.importCourseAlarms([course], 15);
  assert.equal(result.completed, 0);
  assert.match(result.failures[0], /新版本/);
  failAlarm = false;
  granted = false;
  await assert.rejects(api.importCourseCalendar([course], 15, 'term'), /权限/);
  assert.equal(calendars.length, 0);
  granted = true;
  const bad = { ...distant, id: 'bad', name: '失败项' };
  failEvent = true;
  result = await api.importCourseCalendar([course, bad, distant], 15, 'term');
  assert.equal(result.completed, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(events.length, 2);
  assert.equal(calendars.length, 1);
  assert.equal(events[0].location, 'A1');
  assert.deepEqual(events[0].alarms, [{ relativeOffset: -15 }]);
  failEvent = false;
  result = await api.importCourseCalendar([course, bad, distant], 30, 'term');
  assert.equal(result.completed, 3);
  assert.equal(events.length, 3, 'retry updates existing occurrences without duplicates');
  assert.equal(events[0].alarms[0].relativeOffset, -30);
  await api.importCourseCalendar([course], 15, 'other-term');
  assert.equal(events.length, 4, 'same record ID in another schedule remains independent');
  result = await api.importCourseCalendar([{ ...course, start: now - 1 }], 15, 'term');
  assert.equal(result.skipped, 1);
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  assert(config.android.permissions.includes('com.android.alarm.permission.SET_ALARM'));
  assert(config.plugins.some(p => Array.isArray(p) && p[0] === 'expo-calendar'));
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  for (const permission of ['com.android.alarm.permission.SET_ALARM', 'android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR']) assert(manifest.includes(`android:name="${permission}"`));
  console.log('PASS: batch alarm boundaries, skip UI, actionable permission errors, calendar permissions, partial retry, idempotence and native manifest');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

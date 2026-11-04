const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function loader(mocks = {}, timers = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const local = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      return require(name);
    };
    new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', source)(local, mod, mod.exports,
      timers.setInterval ?? setInterval, timers.clearInterval ?? clearInterval);
    return mod.exports;
  }
  return load;
}
async function run() {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
    removeItem: async (key) => { disk.delete(key); },
  };
  const load = loader({ 'react-native': { Platform: { OS: 'android' } }, '@react-native-async-storage/async-storage': storage });
  const grades = load('src/utils/grades.ts');
  assert.equal(grades.normalizeGradeInput({ name: '数学', score: '80', gpa: '  ' }).gpa, 3);
  assert.equal(grades.normalizeGradeInput({ name: '数学', gpa: '' }), null);
  assert.equal(grades.normalizeGradeInput({ name: '数学', score: '80', gpa: 0 }).gpa, 0);
  const client = load('src/services/deepseek.ts');
  const originalFetch = global.fetch;
  let attempts = 0;
  try {
    global.fetch = async () => { attempts++; throw new TypeError('Failed to fetch'); };
    await assert.rejects(client.chatJson([{ role: 'user', content: 'test' }], 'mock'), /网络/);
    assert.equal(attempts, 3, 'network retry must not multiply into nine requests');
    attempts = 0;
    global.fetch = async () => ++attempts === 1
      ? { ok: false, status: 400, text: async () => 'unsupported json mode' }
      : { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
    assert.deepEqual(await client.chatJson([{ role: 'user', content: 'test' }], 'mock'), { ok: true });
    assert.equal(attempts, 2, 'JSON mode compatibility fallback is preserved');
  } finally { global.fetch = originalFetch; }
  const migrated = load('src/utils/storage.ts').migratingStorage('old');
  disk.set('old', 'legacy'); assert.equal(await migrated.getItem('new'), 'legacy');
  disk.set('new', 'current'); await migrated.removeItem('new');
  assert.equal(await migrated.getItem('new'), null);

  const store = load('src/store/useStore.ts').useStore;
  await store.persist.rehydrate();
  const schedule = store.getState().schedules[0];
  const actions = load('src/services/assistantSchedule.ts');
  const course = { name: '审查测试课程', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], teacher: '', classroom: '', color: '#000' };
  const nextId = store.getState().addScheduleWithData({ ...schedule, name: '另一张课表', courses: [] });
  assert.match(actions.applyScheduleActions([{ type: 'add', course }], schedule)[0], /课表已切换/);
  assert.equal(store.getState().schedules.find((s) => s.id === nextId).courses.length, 0);
  store.getState().setActiveSchedule(schedule.id);
  actions.applyScheduleActions([{ type: 'create_schedule', scheduleName: '新课表' }, { type: 'add', course }], schedule);
  let current = store.getState().schedules.find((s) => s.id === store.getState().activeScheduleId);
  assert.equal(current.name, '新课表'); assert.equal(current.courses.length, 1);
  const id = current.courses[0].id;
  actions.applyScheduleActions([
    { type: 'update', courseId: id, patch: { name: '已改名', id: 'bad-id' } },
    { type: 'remove', courseId: 'unknown', courseName: '已改名' },
  ], current);
  current = store.getState().schedules.find((s) => s.id === current.id);
  assert.equal(current.courses.length, 0, 'later actions use current data and preserve course IDs');

  const jobs = [];
  const task = loader({ '@/services/updater': {
    fetchLatestRelease: async () => ({ apkUrl: 'https://example.invalid/app.apk' }), isNewer: () => true,
    createApkDownload: (_, progress) => { const job = { ...deferred(), progress, cancelled: false }; jobs.push(job); return { promise: job.promise, cancel: () => { job.cancelled = true; } }; },
  } })('src/store/useUpdateTask.ts').useUpdateTask;
  await task.getState().check();
  const a = task.getState().download(); task.getState().cancelDownload();
  const b = task.getState().download();
  jobs[0].progress(.9); assert.equal(task.getState().progress, 0);
  jobs[0].resolve('old.apk'); await a;
  assert.equal(task.getState().phase, 'downloading');
  task.getState().cancelDownload(); assert.equal(jobs[1].cancelled, true, 'old completion cannot clear the new cancel handle');
  const c = task.getState().download();
  jobs[1].reject(new Error('old failure')); await b;
  assert.equal(task.getState().phase, 'downloading');
  jobs[2].resolve('new.apk'); await c;
  assert.equal(task.getState().fileUri, 'new.apk');

  let mkdir = deferred(), nativeDownloads = 0, status = 200, size = 10;
  const destinations = [], removed = [];
  const nativeFs = {
    cacheDirectory: 'file:///cache/', makeDirectoryAsync: () => mkdir.promise,
    readDirectoryAsync: async () => [],
    getInfoAsync: async () => ({ exists: true, isDirectory: false, size }),
    deleteAsync: async (uri) => { removed.push(uri); },
    createDownloadResumable: (_, uri) => { nativeDownloads++; destinations.push(uri); return {
      downloadAsync: async () => ({ uri, status }), cancelAsync: async () => {},
    }; },
  };
  const updater = loader({ 'expo-constants': {}, 'expo-file-system/legacy': nativeFs,
    'expo-intent-launcher': {}, 'react-native': { Platform: { OS: 'android' } }, '@/config/update': { GITHUB_REPO: 'test/test' },
  })('src/services/updater.ts');
  const early = updater.createApkDownload('url', () => {}); early.cancel(); mkdir.resolve();
  await assert.rejects(early.promise, /取消/); assert.equal(nativeDownloads, 0);
  status = 404; await assert.rejects(updater.createApkDownload('url', () => {}).promise, /404/);
  status = 200; size = 0; await assert.rejects(updater.createApkDownload('url', () => {}).promise, /为空/);
  size = 10; await updater.createApkDownload('url', () => {}).promise;
  assert.equal(new Set(destinations).size, destinations.length);
  assert.equal(removed.length, 3);

  let focus, listener, off = 0;
  const intervals = new Set();
  const app = { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove: () => { off++; } }; } };
  const hook = loader({ 'expo-router': { useFocusEffect: (fn) => { focus = fn; } },
    react: { useCallback: (fn) => fn, useState: (fn) => [fn(), () => {}] }, 'react-native': { AppState: app },
  }, { setInterval: (fn) => { intervals.add(fn); return fn; }, clearInterval: (id) => intervals.delete(id) })('src/hooks/useForegroundClock.ts');
  hook.useForegroundClock(); const blur = focus(); assert.equal(intervals.size, 1);
  app.currentState = 'background'; listener('background'); assert.equal(intervals.size, 0);
  app.currentState = 'active'; listener('active'); listener('active'); assert.equal(intervals.size, 1);
  blur(); assert.equal(intervals.size, 0); assert.equal(off, 1);
  const pendingNotifications = deferred();
  const scheduled = [];
  const reminders = loader({ 'react-native': { Platform: { OS: 'android' } }, 'expo-notifications': {
    setNotificationHandler() {}, getAllScheduledNotificationsAsync: () => pendingNotifications.promise,
    getPermissionsAsync: async () => ({ granted: true }), setNotificationChannelAsync: async () => {},
    AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    scheduleNotificationAsync: async (request) => { scheduled.push(request); },
  } })('src/services/courseReminders.ts');
  const sample = { ...schedule, courses: [{ ...course, id: 'reminder' }] };
  const planned = reminders.buildCourseReminders(sample, 1, 99, new Date(0));
  assert.equal(planned.length, 1, 'one-minute lead must not produce duplicate reminders');
  assert.equal(reminders.buildCourseReminders({ ...sample, courses: [{ ...sample.courses[0], weekday: 1.5 }] }, 15, 1).length, 0);
  reminders.syncCourseReminders(sample, true, 15, 1);
  await Promise.resolve(); await Promise.resolve();
  reminders.syncCourseReminders(sample, false, 15, 1);
  pendingNotifications.resolve([]);
  await new Promise(setImmediate);
  assert.equal(scheduled.length, 0, 'disabling reminders supersedes queued scheduling');
  console.log('App iteration checks passed: blank GPA, bounded AI retries, legacy reset, switched/batched AI actions, download races/cancellation/HTTP/empty files, foreground clock cleanup. Mock transport only.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });

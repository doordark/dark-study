const assert = require('node:assert/strict');
const disk = new Map();
let fail = false;
const storage = {
  getItem: async key => disk.get(key) ?? null,
  setItem: async (key, value) => { disk.set(key, value); },
  removeItem: async key => { disk.delete(key); },
  multiGet: async keys => keys.map(key => [key, disk.get(key) ?? null]),
  multiSet: async rows => { for (const [key, value] of rows) { disk.set(key, value); if (fail) { fail = false; throw new Error('disk full'); } } },
  multiRemove: async keys => keys.forEach(key => disk.delete(key)),
};
const load = require('./load-project-ts.cjs')({ '@react-native-async-storage/async-storage': storage });
const backup = load('src/utils/backup.ts');
const { commitRestore, recoverInterruptedRestore } = load('src/services/restoreTransaction.ts');
const { DEFAULT_PERIODS, DEFAULT_GRADE_RULES, DEFAULT_GRADE_TYPES, DEFAULT_GRADE_YEARS, SAMPLE_SCHEDULE } = load('src/constants/sample.ts');
const course = { id: 'course1', name: '数据结构', teacher: '', classroom: '', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2], color: 'sky' };
const main = { version: 6, state: { schedules: [{ ...SAMPLE_SCHEDULE, periods: DEFAULT_PERIODS, courses: [course] }], activeScheduleId: SAMPLE_SCHEDULE.id, grades: [], gradeYears: DEFAULT_GRADE_YEARS, activeGradeYearId: DEFAULT_GRADE_YEARS[0].id, gradeTypes: DEFAULT_GRADE_TYPES, gradeRules: DEFAULT_GRADE_RULES, activeGradeRuleId: DEFAULT_GRADE_RULES[0].id, activeGradeSemester: 'fall' } };
async function run() {
  const source = [['dark-study-storage', JSON.stringify(main)], ['dark-study-settings', JSON.stringify({ version: 0, state: { apiKey: 'test-only-private', appearance: 'dark', backgroundImage: 'file:///private.png', renderQuality: 'smooth', defaultScheduleView: 'week', showWeekend: false, showOtherWeeks: true, compactWeekGrid: true, backgroundDim: 0.35 } })], ['dark-study-farm-life-budget', '{"count":20}']];
  const result = backup.createBackup(source);
  assert(!JSON.stringify(result).includes('test-only-private'));
  assert(!JSON.stringify(result).includes('file:///private.png'));
  assert(!JSON.stringify(result).includes('farm-life-budget'));
  assert.equal(result.data['dark-study-settings'].state.defaultScheduleView, 'week');
  assert.equal(result.data['dark-study-settings'].state.showWeekend, false);
  assert.equal(result.data['dark-study-settings'].state.compactWeekGrid, true);
  assert.equal(result.data['dark-study-settings'].state.backgroundDim, 0.35);
  assert.equal(backup.backupSummary(result).courses, 1);
  assert.deepEqual(backup.parseBackup(JSON.stringify(result)), result);
  const badDim = structuredClone(result); badDim.data['dark-study-settings'].state.backgroundDim = 2;
  assert.throws(() => backup.parseBackup(JSON.stringify(badDim)), /遮罩/);
  const badView = structuredClone(result); badView.data['dark-study-settings'].state.defaultScheduleView = 'month';
  assert.throws(() => backup.parseBackup(JSON.stringify(badView)), /视图/);
  const current = [['dark-study-settings', JSON.stringify({ version: 0, state: { apiKey: 'current-only-test', backgroundImage: 'file:///current.png' } })]];
  const replacement = new Map(backup.buildRestorePlan(result, current, 'replace'));
  assert.equal(JSON.parse(replacement.get('dark-study-settings')).state.apiKey, 'current-only-test');
  assert.equal(JSON.parse(replacement.get('dark-study-settings')).state.backgroundImage, 'file:///current.png');
  const existingMain = structuredClone(main); existingMain.state.schedules[0].name = '当前版本';
  const merged = new Map(backup.buildRestorePlan(result, [['dark-study-storage', JSON.stringify(existingMain)]], 'merge'));
  assert.equal(JSON.parse(merged.get('dark-study-storage')).state.schedules[0].name, '当前版本');
  assert.equal(JSON.parse(merged.get('dark-study-storage')).state.schedules.length, 1);
  assert.throws(() => backup.parseBackup('{'), /JSON/);
  assert.throws(() => backup.parseBackup(JSON.stringify({ ...result, version: 99 })), /版本/);
  assert.throws(() => backup.parseBackup(JSON.stringify({ ...result, data: { 'unrelated': {} } })), /模块/);
  assert.throws(() => backup.parseBackup('{"format":"dark-study-backup","version":1,"data":{"__proto__":{}}}'), /无效字段/);
  const invalid = structuredClone(result); invalid.data['dark-study-storage'].state.schedules[0].courses[0].weeks = 'bad';
  assert.throws(() => backup.parseBackup(JSON.stringify(invalid)), /课程/);
  disk.set('dark-study-settings', 'before');
  fail = true;
  await assert.rejects(commitRestore([['dark-study-settings', 'after'], ['dark-study-farm', 'farm']], async () => {}, storage), /disk full/);
  assert.equal(disk.get('dark-study-settings'), 'before'); assert(!disk.has('dark-study-farm'));
  await commitRestore([['dark-study-settings', 'after']], async () => {}, storage);
  assert.equal(disk.get('dark-study-settings'), 'after');
  await assert.rejects(commitRestore([['dark-study-settings', 'bad']], async () => { throw new Error('hydrate failed'); }, storage), /恢复日志/);
  assert(disk.has('dark-study-restore-journal'));
  await recoverInterruptedRestore(storage);
  assert.equal(disk.get('dark-study-settings'), 'after');
  disk.set('dark-study-restore-journal', JSON.stringify([['dark-study-settings', 'before-crash'], ['dark-study-farm', null]]));
  disk.set('dark-study-farm', 'partial');
  assert(await recoverInterruptedRestore(storage));
  assert.equal(disk.get('dark-study-settings'), 'before-crash'); assert(!disk.has('dark-study-farm'));
  // Real Zustand stores must reload restored values; local data stays test-only.
  disk.clear();
  disk.set('dark-study-storage', JSON.stringify(main));
  disk.set('dark-study-settings', JSON.stringify({ version: 0, state: { apiKey: 'integration-only', appearance: 'light' } }));
  const realLoad = require('./load-project-ts.cjs')({ '@react-native-async-storage/async-storage': storage, 'react-native': { Platform: { OS: 'android' } } });
  const service = realLoad('src/services/backupStorage.ts');
  await service.hydrateBackupStores();
  const imported = structuredClone(result); imported.data['dark-study-storage'].state.schedules[0].name = '恢复后的课表';
  await service.restoreBackup(imported, 'replace');
  assert.equal(realLoad('src/store/useStore.ts').useStore.getState().schedules[0].name, '恢复后的课表');
  assert.equal(realLoad('src/store/useSettings.ts').useSettings.getState().apiKey, 'integration-only');
  assert.equal(realLoad('src/store/useDataSession.ts').useDataSession.getState().revision, 1);
  assert(!disk.has('dark-study-restore-journal'));
  assert.equal(backup.backupSummary(await service.collectBackup()).courses, 1);
  realLoad('src/store/useSettings.ts').useSettings.getState().setRenderQuality('beautiful');
  assert.equal((await service.collectBackup()).data['dark-study-settings'].state.renderQuality, 'beautiful', 'export includes a preference changed immediately before exporting');
  console.log('PASS: portable backup, preview counts, key/usage exclusions, merge identity, replacement preferences, malformed/future data rejection, partial-write rollback and crash recovery');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

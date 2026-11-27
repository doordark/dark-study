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
  const widgetSettings = {
    version: 0,
    state: {
      shape: 'large',
      theme: 'dark',
      accent: 'indigo',
      style: 'porcelain',
      mode: 'today',
      count: 4,
      ignoredExtra: 'drop-me',
    },
  };
  const source = [
    ['dark-study-storage', JSON.stringify(main)],
    ['dark-study-settings', JSON.stringify({ version: 0, state: { apiKey: 'test-only-private', appearance: 'dark', material: 'clear', backgroundImage: 'file:///private.png', renderQuality: 'smooth', defaultScheduleView: 'week', showWeekend: false, showOtherWeeks: true, compactWeekGrid: true, backgroundDim: 0.35 } })],
    ['dark-study-widget-settings', JSON.stringify(widgetSettings)],
    ['dark-study-farm-life-budget', '{"count":20}'],
  ];
  const result = backup.createBackup(source);
  assert(!JSON.stringify(result).includes('test-only-private'));
  assert(!JSON.stringify(result).includes('file:///private.png'));
  assert(!JSON.stringify(result).includes('farm-life-budget'));
  assert.equal(result.data['dark-study-settings'].state.material, 'clear');
  assert.equal(result.data['dark-study-settings'].state.defaultScheduleView, 'week');
  assert.equal(result.data['dark-study-settings'].state.showWeekend, false);
  assert.equal(result.data['dark-study-settings'].state.compactWeekGrid, true);
  assert.equal(result.data['dark-study-settings'].state.backgroundDim, 0.35);
  assert.equal(result.data['dark-study-widget-settings'].state.style, 'porcelain');
  assert.equal(result.data['dark-study-widget-settings'].state.mode, 'today');
  assert.equal(result.data['dark-study-widget-settings'].state.ignoredExtra, undefined);
  assert.equal(backup.backupSummary(result).courses, 1);
  assert.deepEqual(backup.parseBackup(JSON.stringify(result)), result);
  for (const style of ['frosted', 'porcelain', 'tinted']) {
    for (const mode of ['upcoming', 'today', 'week']) {
      const variant = structuredClone(result);
      variant.data['dark-study-widget-settings'].state.style = style;
      variant.data['dark-study-widget-settings'].state.mode = mode;
      const parsedVariant = backup.parseBackup(JSON.stringify(variant));
      assert.equal(parsedVariant.data['dark-study-widget-settings'].state.style, style);
      assert.equal(parsedVariant.data['dark-study-widget-settings'].state.mode, mode);
    }
  }
  const badWidgetStyle = structuredClone(result);
  badWidgetStyle.data['dark-study-widget-settings'].state.style = 'glass';
  assert.throws(() => backup.parseBackup(JSON.stringify(badWidgetStyle)), /小组件质感/);
  const nullWidgetStyle = structuredClone(result);
  nullWidgetStyle.data['dark-study-widget-settings'].state.style = null;
  assert.throws(() => backup.parseBackup(JSON.stringify(nullWidgetStyle)), /小组件质感/);
  const badWidgetMode = structuredClone(result);
  badWidgetMode.data['dark-study-widget-settings'].state.mode = 'month';
  assert.throws(() => backup.parseBackup(JSON.stringify(badWidgetMode)), /小组件模式/);
  const nullWidgetMode = structuredClone(result);
  nullWidgetMode.data['dark-study-widget-settings'].state.mode = null;
  assert.throws(() => backup.parseBackup(JSON.stringify(nullWidgetMode)), /小组件模式/);
  const legacyWidget = structuredClone(result);
  delete legacyWidget.data['dark-study-widget-settings'].state.style;
  delete legacyWidget.data['dark-study-widget-settings'].state.mode;
  const parsedLegacy = backup.parseBackup(JSON.stringify(legacyWidget));
  assert.equal('style' in parsedLegacy.data['dark-study-widget-settings'].state, false);
  assert.equal('mode' in parsedLegacy.data['dark-study-widget-settings'].state, false);
  const legacyPlan = new Map(backup.buildRestorePlan(parsedLegacy, [], 'replace'));
  assert.equal(JSON.parse(legacyPlan.get('dark-study-widget-settings')).state.shape, 'large');
  const badDim = structuredClone(result); badDim.data['dark-study-settings'].state.backgroundDim = 2;
  assert.throws(() => backup.parseBackup(JSON.stringify(badDim)), /遮罩/);
  const badView = structuredClone(result); badView.data['dark-study-settings'].state.defaultScheduleView = 'month';
  assert.throws(() => backup.parseBackup(JSON.stringify(badView)), /视图/);
  const frostedMaterial = structuredClone(result); frostedMaterial.data['dark-study-settings'].state.material = 'frosted';
  assert.equal(backup.parseBackup(JSON.stringify(frostedMaterial)).data['dark-study-settings'].state.material, 'frosted');
  const badMaterial = structuredClone(result); badMaterial.data['dark-study-settings'].state.material = 'acrylic';
  assert.throws(() => backup.parseBackup(JSON.stringify(badMaterial)), /材质/);
  const currentWidget = { version: 0, state: { shape: 'square', theme: 'light', accent: 'blue', style: 'tinted', mode: 'upcoming', count: 2 } };
  const current = [
    ['dark-study-settings', JSON.stringify({ version: 0, state: { apiKey: 'current-only-test', backgroundImage: 'file:///current.png' } })],
    ['dark-study-widget-settings', JSON.stringify(currentWidget)],
  ];
  const replacement = new Map(backup.buildRestorePlan(result, current, 'replace'));
  assert.equal(JSON.parse(replacement.get('dark-study-settings')).state.apiKey, 'current-only-test');
  assert.equal(JSON.parse(replacement.get('dark-study-settings')).state.backgroundImage, 'file:///current.png');
  assert.equal(JSON.parse(replacement.get('dark-study-widget-settings')).state.style, 'porcelain');
  assert.equal(JSON.parse(replacement.get('dark-study-widget-settings')).state.mode, 'today');
  const existingMain = structuredClone(main); existingMain.state.schedules[0].name = '当前版本';
  const merged = new Map(backup.buildRestorePlan(result, [['dark-study-storage', JSON.stringify(existingMain)]], 'merge'));
  assert.equal(JSON.parse(merged.get('dark-study-storage')).state.schedules[0].name, '当前版本');
  assert.equal(JSON.parse(merged.get('dark-study-storage')).state.schedules.length, 1);
  assert.equal(JSON.parse(merged.get('dark-study-widget-settings')).state.style, 'porcelain');
  assert.equal(JSON.parse(merged.get('dark-study-widget-settings')).state.mode, 'today');
  const mergedWithExistingWidget = new Map(backup.buildRestorePlan(result, [['dark-study-storage', JSON.stringify(existingMain)], ['dark-study-widget-settings', JSON.stringify(currentWidget)]], 'merge'));
  assert.equal(JSON.parse(mergedWithExistingWidget.get('dark-study-widget-settings')).state.style, 'tinted');
  assert.equal(JSON.parse(mergedWithExistingWidget.get('dark-study-widget-settings')).state.mode, 'upcoming');
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
  disk.set('dark-study-widget-settings', JSON.stringify({ version: 0, state: { shape: 'rectangle', theme: 'system', accent: 'default', style: 'frosted', mode: 'upcoming', count: 3 } }));
  const secureStore = new Map();
  const realLoad = require('./load-project-ts.cjs')({
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async key => secureStore.get(key) ?? null,
      setItemAsync: async (key, value) => { secureStore.set(key, value); },
      deleteItemAsync: async key => { secureStore.delete(key); },
    },
  });
  const service = realLoad('src/services/backupStorage.ts');
  await service.hydrateBackupStores();
  const imported = structuredClone(result); imported.data['dark-study-storage'].state.schedules[0].name = '恢复后的课表';
  await service.restoreBackup(imported, 'replace');
  assert.equal(realLoad('src/store/useStore.ts').useStore.getState().schedules[0].name, '恢复后的课表');
  assert.equal(realLoad('src/store/useSettings.ts').useSettings.getState().apiKey, 'integration-only');
  assert.equal(realLoad('src/store/useWidgetSettings.ts').useWidgetSettings.getState().style, 'porcelain');
  assert.equal(realLoad('src/store/useWidgetSettings.ts').useWidgetSettings.getState().mode, 'today');
  assert.equal(realLoad('src/store/useDataSession.ts').useDataSession.getState().revision, 1);
  assert(!disk.has('dark-study-restore-journal'));
  assert.equal(backup.backupSummary(await service.collectBackup()).courses, 1);
  realLoad('src/store/useSettings.ts').useSettings.getState().setRenderQuality('beautiful');
  realLoad('src/store/useWidgetSettings.ts').useWidgetSettings.getState().setStyle('tinted');
  realLoad('src/store/useWidgetSettings.ts').useWidgetSettings.getState().setMode('upcoming');
  const collected = await service.collectBackup();
  assert.equal(collected.data['dark-study-settings'].state.renderQuality, 'beautiful', 'export includes a preference changed immediately before exporting');
  assert.equal(collected.data['dark-study-widget-settings'].state.style, 'tinted', 'export includes widget style changed immediately before exporting');
  assert.equal(collected.data['dark-study-widget-settings'].state.mode, 'upcoming', 'export includes widget mode changed immediately before exporting');

  // --- Upgrade 3: NightSky + DesktopPet + Forward-Compatible Grade/Settings/Focus Fields ---
  const v2Main = structuredClone(main);
  v2Main.state.gradeRules = [
    { ...DEFAULT_GRADE_RULES[0], retakePolicy: 'highest' },
    { id: 'rule-latest', name: '最新策略', excludedTypes: [], excludedCourseIds: [], retakePolicy: 'latest' },
    { id: 'rule-all', name: '全计入', excludedTypes: [], excludedCourseIds: [], retakePolicy: 'all' },
  ];
  const nightChronicle = {
    visits: 12,
    totalStarsCollected: 42,
    unlockedConstellations: ['big-dipper', 'lyra', 'big-dipper'],
    owlPathUnlocked: true,
    lastConstellationId: 'lyra',
    secretBadges: ['star-musician', 'blood-moon'],
    wishesSent: 4,
    meteorsTapped: 19,
    unexpectedNoise: 'drop-me',
  };
  const nightFavorites = [
    { id: 'q1', text: '星光不问赶路人', work: '夜航船', author: '张岱', category: 'book' },
    { id: 'q1', text: '重复ID去重', work: '夜航船', category: 'book' },
  ];
  const nightWishes = [
    { id: 'w1', text: '期末高数 95+', createdAt: 1730000000000, constellationName: '北斗七星', echoedAt: 1730050000000 },
  ];
  const desktopPet = {
    version: 0,
    state: {
      autoFollowBackground: false,
      overlayMode: 'always',
      petScale: 1.2,
      petOpacity: 0.85,
      panelTheme: 'dark',
      tapAction: 'panel',
      showBubbles: false,
      running: true, // transient runtime field must be stripped
    },
  };
  const studyProgressWithFocus = {
    version: 0,
    state: {
      attendanceByCourse: {},
      customAbsenceLimits: {},
      focusLogs: [],
      pendingFarmRewards: [],
      activeFocusSession: {
        id: 'focus-1',
        mode: 'focus',
        courseKey: 'math::prof',
        courseName: '高等数学',
        totalSec: 1500,
        remainingSec: 800,
        endAt: 1730001000000,
        running: true,
        notificationId: 'local-notif-id',
        ambientOn: true,
        startedAt: 1730000000000,
      },
    },
  };

  const fullBackup = backup.createBackup([
    ['dark-study-storage', JSON.stringify(v2Main)],
    ['dark-study-settings', JSON.stringify({
      version: 0,
      state: {
        appearance: 'dark',
        graduationCreditTargets: { required: 96, elective: 32.5, general: 16 },
      },
    })],
    ['dark-study-study-progress', JSON.stringify(studyProgressWithFocus)],
    ['dark-study-desktop-pet', JSON.stringify(desktopPet)],
    ['dark-study-night-chronicle', JSON.stringify(nightChronicle)],
    ['dark-study-night-favorites', JSON.stringify(nightFavorites)],
    ['dark-study-night-visits', '12'],
    ['dark-study-night-wishes', JSON.stringify(nightWishes)],
  ]);

  assert.deepEqual(backup.parseBackup(JSON.stringify(fullBackup)), fullBackup);
  assert.deepEqual(fullBackup.data['dark-study-settings'].state.graduationCreditTargets, { required: 96, elective: 32.5, general: 16 });
  assert.equal(fullBackup.data['dark-study-storage'].state.gradeRules[0].retakePolicy, 'highest');
  assert.equal(fullBackup.data['dark-study-storage'].state.gradeRules[1].retakePolicy, 'latest');
  assert.equal('activeFocusSession' in fullBackup.data['dark-study-study-progress'].state, false, 'transient activeFocusSession is safely tolerated & omitted');
  assert.equal(fullBackup.data['dark-study-desktop-pet'].state.overlayMode, 'always');
  assert.equal(fullBackup.data['dark-study-desktop-pet'].state.running, undefined);
  assert.deepEqual(fullBackup.data['dark-study-night-chronicle'].unlockedConstellations, ['big-dipper', 'lyra']);
  assert.equal(fullBackup.data['dark-study-night-chronicle'].unexpectedNoise, undefined);
  assert.equal(fullBackup.data['dark-study-night-favorites'].length, 1);
  assert.equal(fullBackup.data['dark-study-night-visits'], '12');
  assert.equal(fullBackup.data['dark-study-night-wishes'][0].echoedAt, 1730050000000);

  // Validation rejections for new fields & modules
  const badTargets = structuredClone(fullBackup);
  badTargets.data['dark-study-settings'].state.graduationCreditTargets = { required: -5 };
  assert.throws(() => backup.parseBackup(JSON.stringify(badTargets)), /毕业学分目标/);
  const badRetake = structuredClone(fullBackup);
  badRetake.data['dark-study-storage'].state.gradeRules[0].retakePolicy = 'invalid';
  assert.throws(() => backup.parseBackup(JSON.stringify(badRetake)), /重修策略/);
  const badPet = structuredClone(fullBackup);
  badPet.data['dark-study-desktop-pet'].state.petScale = 9;
  assert.throws(() => backup.parseBackup(JSON.stringify(badPet)), /桌宠缩放/);
  const badNightVisits = structuredClone(fullBackup);
  badNightVisits.data['dark-study-night-visits'] = '-3';
  assert.throws(() => backup.parseBackup(JSON.stringify(badNightVisits)), /夜空访问次数/);
  const badNightFav = structuredClone(fullBackup);
  badNightFav.data['dark-study-night-favorites'] = [{ id: 'bad', text: 't', work: 'w', category: 'unknown' }];
  assert.throws(() => backup.parseBackup(JSON.stringify(badNightFav)), /收藏星笺/);

  // Merge semantics for night sky (union & max counters)
  const nightMergePlan = new Map(backup.buildRestorePlan(fullBackup, [
    ['dark-study-night-visits', '20'],
    ['dark-study-night-chronicle', JSON.stringify({ visits: 20, totalStarsCollected: 30, unlockedConstellations: ['orion'], owlPathUnlocked: false, secretBadges: ['wish-keeper'], wishesSent: 9, meteorsTapped: 5 })],
    ['dark-study-night-favorites', JSON.stringify([{ id: 'q0', text: '旧收藏', work: '诗经', category: 'book' }])],
    ['dark-study-night-wishes', JSON.stringify([{ id: 'w0', text: '早睡早起', createdAt: 1730099999000, constellationName: '猎户守望' }])],
  ], 'merge'));
  assert.equal(nightMergePlan.get('dark-study-night-visits'), '20');
  const mergedChronicle = JSON.parse(nightMergePlan.get('dark-study-night-chronicle'));
  assert.equal(mergedChronicle.visits, 20);
  assert.equal(mergedChronicle.totalStarsCollected, 42);
  assert.equal(mergedChronicle.owlPathUnlocked, true);
  assert.deepEqual(mergedChronicle.unlockedConstellations, ['orion', 'big-dipper', 'lyra']);
  assert.deepEqual(mergedChronicle.secretBadges, ['wish-keeper', 'star-musician', 'blood-moon']);
  assert.equal(JSON.parse(nightMergePlan.get('dark-study-night-favorites')).length, 2);
  assert.equal(JSON.parse(nightMergePlan.get('dark-study-night-wishes')).length, 2);

  // Full integration restore via backupStorage: desktopPet rehydrates & night-sky keys restore/clear cleanly
  await service.restoreBackup(fullBackup, 'replace');
  assert.equal(realLoad('src/store/useDesktopPet.ts').useDesktopPet.getState().overlayMode, 'always');
  assert.equal(realLoad('src/store/useDesktopPet.ts').useDesktopPet.getState().petScale, 1.2);
  assert.equal(realLoad('src/store/useDesktopPet.ts').useDesktopPet.getState().panelTheme, 'dark');
  assert.equal(disk.get('dark-study-night-visits'), '12');
  assert.equal(JSON.parse(disk.get('dark-study-night-wishes')).length, 1);

  // Restoring an older v1 backup (without night-sky keys) in replace mode clears stale night-sky keys smoothly
  await service.restoreBackup(result, 'replace');
  assert.equal(disk.has('dark-study-night-chronicle'), false);
  assert.equal(disk.has('dark-study-night-favorites'), false);
  assert.equal(disk.has('dark-study-night-visits'), false);
  assert.equal(disk.has('dark-study-night-wishes'), false);

  console.log('PASS: portable backup, NightSky + DesktopPet + forward-compatible Grade/Settings/Focus coverage, widget style/mode backup & restore, preview counts, key/usage exclusions, merge identity, replacement preferences, malformed/future data rejection, partial-write rollback and crash recovery');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

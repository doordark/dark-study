const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  cache.set(filename, m);
  m.require = name => {
    if (name === '@/services/farmChat') {
      return { farmChat: async () => { throw new Error('mock-disabled'); }, FarmChatError: class extends Error {} };
    }
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    return require(name);
  };
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  );
  return m.exports;
}

const social = load('src/utils/farmSocial.ts');
const studyLink = load('src/utils/farmStudyLink.ts');
const town = load('src/utils/farmTown.ts');
const memory = load('src/utils/farmMemory.ts');
const groupChat = load('src/utils/farmGroupChat.ts');

const morningAt = new Date(2026, 10, 25, 10, 30).getTime(); // Wed 2026-11-25 10:30

// 1. Gift preferences, return reward, rumor seeding, angry moderation & daily cap
const baseMemories = memory.restoreFarmMemories(null);
const lovedOutcome = social.evaluateResidentGift('gu', 'soup', baseMemories.gu, 0, morningAt);
assert.equal(lovedOutcome.tier, 'loved');
assert.equal(lovedOutcome.affinityDelta, 6, 'loved gift boosts affinity by +6');
assert.equal(lovedOutcome.nextMemory.affinity, baseMemories.gu.affinity + 6);
assert.equal(lovedOutcome.nextMemory.mood, '开心');
assert.ok(lovedOutcome.reward, 'loved gift under cap grants a return gift');
assert.ok(lovedOutcome.rumor, 'loved gift seeds a happy town rumor');
assert.ok(lovedOutcome.rumor.knownBy.includes('gu'));
assert.ok(
  (lovedOutcome.nextMemory.episodes ?? []).some(ep => ep.tags.includes('送礼') && ep.text.includes('田园浓汤')),
  'gifting records a persona memory episode',
);

const angryGu = { ...baseMemories.gu, mood: '生气', affinity: 40 };
const peaceOutcome = social.evaluateResidentGift('gu', 'soup', angryGu, 0, morningAt);
assert.equal(peaceOutcome.nextMemory.mood, '缓和', 'angry resident softens gradually instead of instant reset');
assert.equal(peaceOutcome.affinityDelta, 2, 'angry resident gains smaller affinity delta');
assert.equal(peaceOutcome.reward, undefined, 'angry resident does not give return gift immediately');

const cappedOutcome = social.evaluateResidentGift('gu', 'soup', baseMemories.gu, 2, morningAt);
assert.equal(cappedOutcome.affinityDelta, 0, 'daily cap stops affinity farming after 2 gifts/day');
assert.equal(cappedOutcome.reward, undefined, 'daily cap suppresses repeated return gifts');
assert.equal(cappedOutcome.rumor, undefined, 'daily cap suppresses repeated gift rumors');
assert.equal(cappedOutcome.countsToday, 3);

// 2. Daily wishes generation, level gating & same-day/next-day restoration
const lv1Wishes = social.generateDailyWishes(1, morningAt);
assert.equal(lv1Wishes.length, 3, 'generates 3 daily wishes');
assert.equal(new Set(lv1Wishes.map(w => w.resident)).size, 3, 'wishes belong to 3 distinct residents');
for (const w of lv1Wishes) {
  assert.ok(['radish', 'wheat'].includes(w.crop), `lv1 wish crop ${w.crop} must be unlocked at lv1`);
  assert.equal(w.fulfilled, false);
}

const sameDayFulfilled = [{ ...lv1Wishes[0], fulfilled: true }, lv1Wishes[1], lv1Wishes[2]];
const restoredSameDay = social.restoreDailyWishes(sameDayFulfilled, 1, morningAt + 3600_000);
assert.equal(restoredSameDay[0].fulfilled, true, 'same-day wish fulfillment persists');

const nextDayAt = new Date(2026, 10, 26, 9, 0).getTime();
const restoredNextDay = social.restoreDailyWishes(sameDayFulfilled, 3, nextDayAt);
assert.equal(restoredNextDay.length, 3);
assert.ok(restoredNextDay.every(w => !w.fulfilled && w.date !== lv1Wishes[0].date), 'new date regenerates fresh wishes');

// 3. Study-day gentle link: disabled, packed day, free weekend, late night & zero sensitive leakage
const sampleSchedule = {
  id: 'sched-1',
  name: '秋季课表',
  startDate: '2026-11-23', // Monday of week 1
  totalWeeks: 16,
  periods: [],
  courses: [
    { id: 'c1', name: '高等数学(保密课名)', teacher: '张教授', classroom: 'A101', weekday: 3, startPeriod: 1, endPeriod: 2, weeks: [1], color: '#fff' },
    { id: 'c2', name: '数据结构', teacher: '李教授', classroom: 'B202', weekday: 3, startPeriod: 3, endPeriod: 4, weeks: [1], color: '#fff' },
    { id: 'c3', name: '操作系统', teacher: '王教授', classroom: 'C303', weekday: 3, startPeriod: 5, endPeriod: 6, weeks: [1], color: '#fff' },
    { id: 'c4', name: '计算机网络', teacher: '赵教授', classroom: 'D404', weekday: 3, startPeriod: 7, endPeriod: 8, weeks: [1], color: '#fff' },
    { id: 'c5', name: '编译原理', teacher: '周教授', classroom: 'E505', weekday: 3, startPeriod: 9, endPeriod: 10, weeks: [1], color: '#fff' },
  ],
};
const sampleGrades = [
  { id: 'g1', name: '高等数学', score: 98.5, credits: 4, gpa: 4.0, year: '大二', semester: '上', type: '必修' },
];

const disabledCtx = studyLink.summarizeStudyDay(sampleSchedule, sampleGrades, morningAt, false);
assert.equal(disabledCtx.enabled, false);
assert.equal(disabledCtx.brief, '', 'disabled study link emits empty brief');
assert.equal(disabledCtx.gazetteNote, '', 'disabled study link emits empty gazette note');

const packedCtx = studyLink.summarizeStudyDay(sampleSchedule, sampleGrades, morningAt, true);
assert.equal(packedCtx.enabled, true);
assert.equal(packedCtx.weekNumber, 1);
assert.equal(packedCtx.todayCourseCount, 5);
assert.equal(packedCtx.workload, 'packed');
assert.ok(packedCtx.brief.includes('5 节满课'));
assert.ok(!packedCtx.brief.includes('高等数学'), 'never leaks specific course names into prompts');
assert.ok(!packedCtx.brief.includes('98.5'), 'never leaks specific grade scores into prompts');
assert.ok(!packedCtx.gazetteNote.includes('高等数学'), 'never leaks specific course names into gazette');

const lateNightAt = new Date(2026, 10, 25, 23, 30).getTime();
const lateCtx = studyLink.summarizeStudyDay(sampleSchedule, sampleGrades, lateNightAt, true);
assert.equal(lateCtx.lateNight, true);
assert.ok(lateCtx.brief.includes('深夜'));
assert.ok(lateCtx.gazetteNote.includes('热汤'));

const sundayAt = new Date(2026, 10, 29, 14, 0).getTime();
const weekendCtx = studyLink.summarizeStudyDay(sampleSchedule, sampleGrades, sundayAt, true);
assert.equal(weekendCtx.weekday, 7);
assert.equal(weekendCtx.workload, 'free');
assert.ok(weekendCtx.brief.includes('周末'));

// 4. Gazette & group chat prompt integration + town state round-trip
const gazette = town.compileFarmGazette({
  day: 7,
  seasonIndex: 0,
  weather: 'clear',
  rainbow: false,
  history: [],
  town: town.emptyTownState(),
  memories: baseMemories,
  studyNote: packedCtx.gazetteNote,
  at: morningAt,
});
assert.ok(gazette.stories[0].includes('暖心专栏'), 'gazette prepends study gentle note when provided');

const groupMsgs = groupChat.buildGroupChatMessages({
  text: '大家好呀',
  members: ['door', 'gu', 'yujie'],
  responders: ['gu', 'yujie'],
  memories: baseMemories,
  recentMessages: [],
  scene: { day: 7, season: '春', growing: 4, ripe: 1, night: false },
  studyBrief: packedCtx.brief,
  at: morningAt,
});
assert.ok(groupMsgs[0].content.includes('5 节满课'), 'group chat system prompt receives gentle study brief');

const savedTown = {
  ...town.emptyTownState(),
  wishes: sameDayFulfilled,
  giftCounts: { date: lv1Wishes[0].date, counts: { gu: 2, door: 1 } },
  studyLinkEnabled: false,
};
const restoredTown = town.restoreTownState(savedTown, 1, morningAt);
assert.equal(restoredTown.studyLinkEnabled, false, 'restores studyLinkEnabled=false');
assert.equal(restoredTown.giftCounts.counts.gu, 2, 'restores daily gift counts');
assert.equal(restoredTown.wishes.length, 3);
assert.equal(restoredTown.wishes[0].fulfilled, true);

console.log('PASS: farm phase 2 social gifting, daily wishes, study link & town persistence verified');

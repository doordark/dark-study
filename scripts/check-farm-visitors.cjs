const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PNG } = require('pngjs');

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

const visitors = load('src/utils/farmVisitors.ts');
const sleep = load('src/utils/farmSleep.ts');
const town = load('src/utils/farmTown.ts');
const memory = load('src/utils/farmMemory.ts');
const { FarmResidentEngine } = load('src/utils/farmResidentAI.ts');

// 1. Validate 3 visitor 8x5 animated sprite atlases (1152x720, 144x144 transparent padded cells, 120 total cells including Dafeiyu)
let checkedCells = 0;
for (const file of ['farm-visitors-idle.png', 'farm-visitors-walk.png', 'farm-visitors-talk.png']) {
  const im = PNG.sync.read(fs.readFileSync(path.join(root, 'assets/images', file)));
  assert.equal(im.width, 1152, `${file} width must be 1152 (8 cols x 144)`);
  assert.equal(im.height, 720, `${file} height must be 720 (5 rows x 144, row 4 = Dafeiyu)`);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      let opaque = 0;
      let transparent = 0;
      for (let y = row * 144; y < (row + 1) * 144; y++) {
        for (let x = col * 144; x < (col + 1) * 144; x++) {
          const a = im.data[(y * im.width + x) * 4 + 3];
          if (a >= 180) opaque++;
          if (a === 0) transparent++;
          if (x === col * 144 || x === (col + 1) * 144 - 1 || y === row * 144 || y === (row + 1) * 144 - 1) {
            assert.equal(a, 0, `${file} cell (${row},${col}) must have transparent outer border`);
          }
        }
      }
      assert.ok(opaque > 1200, `${file} cell (${row},${col}) must contain sprite artwork`);
      assert.ok(transparent > 4000, `${file} cell (${row},${col}) must have clean transparent padding`);
      checkedCells++;
    }
  }
}
assert.equal(checkedCells, 120);

// 2. Normal visitors: profiles, gifting, offline dialogue
const at = new Date(2026, 10, 25, 21, 30).getTime();
const vState = visitors.emptyVisitorState();
assert.ok(visitors.VISITORS.huboqi.persona.includes('王者'));
assert.ok(visitors.VISITORS.xushuiyin.persona.includes('打瓦'));
assert.ok(visitors.VISITORS.huangbingqi.persona.includes('篮球'));
assert.ok(visitors.VISITORS.dafeiyu && visitors.VISITORS.dafeiyu.row === 4, 'Dafeiyu visitor present at row 4');

// Verify Dafeiyu schedule persona & memory sync
const customSync = {
  enabled: true,
  persona: { name: '小蓝鲸', userName: '阿顾', description: '温柔陪伴的蓝发鲸鱼娘', traits: { tsundere: 80, affection: 85, warmth: 90, playfulness: 75, verbosity: 35 } },
  facts: [{ id: 'f1', key: '喜好', text: '最喜欢晚上喝热牛奶', source: 'manual', importance: 9, updatedAt: at }],
  openLoops: [{ id: 'l1', topic: '周五高数测验', dueHint: '周五', createdAt: at }],
};
const syncedProfile = visitors.resolveVisitorDisplayProfile('dafeiyu', customSync);
assert.equal(syncedProfile.name, '小蓝鲸', 'Dafeiyu display name syncs with schedule persona');
assert.ok(syncedProfile.greetings[0].includes('阿顾'), 'Dafeiyu greeting uses configured userName');
const rainBehavior = visitors.visitorWeatherBehavior('dafeiyu', 'rain', false, customSync);
assert.equal(rainBehavior.badge, '雨中踩水花', 'Dafeiyu enjoys rain puddles instead of hiding');
const recallReply = visitors.offlineVisitorReply('dafeiyu', '你还记得我喜欢喝什么吗？', false, 'clear', false, customSync);
assert.ok(recallReply.includes('热牛奶'), 'Dafeiyu offline reply recalls schedule whale memory facts');

const giftRes = visitors.evaluateVisitorGift('huboqi', 'bread', vState.records.huboqi, at);
assert.equal(giftRes.affinityDelta, 7, 'loved gift boosts visitor affinity by +7');
assert.ok(giftRes.reply.includes('麦香面包'));

// 3. Horror Dark Xu Shuiyin trigger, foreign-girl banish options & next-day sleep deprivation
assert.equal(
  visitors.shouldTriggerNightHorror({ state: vState, night: false, day: 5, roll: 0.01 }),
  false,
  'horror never auto-triggers during daytime',
);
assert.equal(
  visitors.shouldTriggerNightHorror({ state: vState, night: true, day: 5, roll: 0.1 }),
  true,
  'horror triggers during night when roll is below threshold',
);

const introRes = visitors.resolveHorrorBanish('introduce_foreign_girl', at);
assert.equal(introRes.rewardCoins, 35);
assert.ok(introRes.reply.includes('外国洋妞'));
assert.ok(introRes.rumor.title.includes('外国洋妞'));

const trickRes = visitors.resolveHorrorBanish('trick_foreign_girl', at);
assert.equal(trickRes.rewardCoins, 35);
assert.ok(trickRes.reply.includes('集市口'));

const unplugRes = visitors.resolveHorrorBanish('unplug', at);
assert.equal(unplugRes.rewardCoins, 35);

const baseMem = memory.restoreFarmMemories(null);
const aftermath = visitors.recordHorrorAftermathToFamily(baseMem, at);
assert.equal(aftermath.event.knownBy.length, 6, 'all 6 family members remember the sleepless horror night');
assert.ok((aftermath.nextMemories.door.episodes ?? []).some(e => e.tags.includes('睡眠不足')));

const tiredState = { ...vState, sleepDeprivedDay: 5, lastHorrorDay: 5, horrorBanishedCount: 1 };
assert.equal(visitors.isFarmSleepDeprived(tiredState, 5), true, 'sleep deprived on same night');
assert.equal(visitors.isFarmSleepDeprived(tiredState, 6), true, 'sleep deprived on following day');
assert.equal(visitors.isFarmSleepDeprived(tiredState, 7), false, 'recovers after two days');

const gazette = town.compileFarmGazette({
  day: 6,
  seasonIndex: 0,
  weather: 'clear',
  rainbow: false,
  history: [],
  town: { ...town.emptyTownState(), visitors: tiredState },
  memories: aftermath.nextMemories,
  at,
});
assert.ok(gazette.stories.some(s => s.includes('睡眠警报') && s.includes('徐睡阴')), 'next-day gazette reports sleep deprivation');

// 4. Nighttime indoor sleep system, waking up & solo emo random event
const dayRes = sleep.computeSleepingResidents({ night: false, day: 5, wokenIds: [] });
assert.equal(dayRes.sleeping.length, 0, 'nobody sleeps indoors during daytime');
assert.equal(dayRes.soloEvent, null);

let foundSoloDay = null;
const seenCategories = new Set();
for (let d = 1; d <= 40; d++) {
  const res = sleep.computeSleepingResidents({ night: true, day: d, wokenIds: [], weather: 'clear' });
  if (res.soloEvent) {
    if (!foundSoloDay) foundSoloDay = { d, res };
    seenCategories.add(res.soloEvent.category);
  }
}
assert.ok(foundSoloDay, 'some nights spawn a resident outdoors');
assert.ok(sleep.allNightEventPoolCount() >= 25, 'rich pool of at least 25 distinct nighttime events');
assert.ok(seenCategories.size >= 4, 'nighttime stay-up events span diverse categories beyond emo');
const rainNight = sleep.resolveNightSoloEvent(foundSoloDay.d, true, 'rain');
assert.ok(rainNight && rainNight.rainSafe === true, 'rainy night picks sheltered rainSafe stay-up event');
assert.equal(foundSoloDay.res.sleeping.length, 4, 'other 4 human residents sleep indoors while 1 is solo outdoors');
assert.ok(!foundSoloDay.res.sleeping.includes(foundSoloDay.res.soloEvent.resident));

const wokenRes = sleep.computeSleepingResidents({
  night: true,
  day: foundSoloDay.d,
  wokenIds: [foundSoloDay.res.sleeping[0]],
});
assert.equal(wokenRes.sleeping.length, 3, 'waking a sleeping resident removes them from indoor sleepers');

// Verify FarmResidentEngine respects sleepingResidents without disturbing outdoor tests
const engine = new FarmResidentEngine(at);
engine.setTownContext({ sleepingResidents: ['door', 'gu'], sleepDeprived: true });
const doorPosBefore = { ...engine.residents.door.logicalPosition };
engine.tick(at + 6000, {
  autonomous: true,
  night: true,
  busyResident: null,
  farmNeeds: {
    dryPlots: 0, ripePlots: 0, water: 5, waterCap: 5, canRust: 0, coopComfort: 80,
    period: 'night', weather: 'clear', rainbow: false, day: 6, season: 0,
  },
});
assert.deepEqual(engine.residents.door.logicalPosition, doorPosBefore, 'sleeping resident stays indoors and does not wander');

// 5. Daytime & nighttime live weather awareness across residents, visitors & group chat
const groupChat = load('src/utils/farmGroupChat.ts');
assert.equal(town.residentWeatherStatus('gu', 'rain', false, 'noon').badge, '檐下避雨');
assert.equal(town.residentWeatherStatus('yujie', 'rain', false, 'noon').badge, '棚下听雨');
assert.equal(town.residentWeatherStatus('weigang', 'rain', false, 'noon').badge, '雨中观鱼');
assert.equal(town.residentWeatherStatus('chicken', 'rain', false, 'noon').badge, '窝里躲雨');
assert.equal(town.residentWeatherStatus('door', 'clear', true, 'morning').badge, '看彩虹');
assert.equal(town.residentWeatherStatus('gu', 'clear', false, 'noon').badge, undefined);

const visitorRain = visitors.visitorWeatherBehavior('huangbingqi', 'rain', false);
assert.equal(visitorRain.badge, '躲雨中');
assert.ok(visitorRain.waypoints.includes('marketDoor'));
const visitorRainbow = visitors.visitorWeatherBehavior('huangbingqi', 'clear', true);
assert.equal(visitorRainbow.badge, '看彩虹');
assert.ok(visitors.offlineVisitorReply('huangbingqi', '今天天气怎么样？', false, 'rain', false).includes('小雨'));
assert.ok(visitors.offlineVisitorReply('huangbingqi', '今天天气怎么样？', false, 'clear', true).includes('彩虹'));

const rainGroupMsgs = groupChat.buildGroupChatMessages({
  text: '今天天气真特别',
  members: ['door', 'gu', 'yujie'],
  responders: ['gu', 'yujie'],
  memories: baseMem,
  recentMessages: [],
  scene: { day: 6, season: '春', growing: 3, ripe: 0, night: false, weather: 'rain', rainbow: false, period: 'noon' },
  at,
});
assert.ok(rainGroupMsgs[0].content.includes('细雨绵绵'), 'group chat prompt reads live rain weather');

const weatherEngine = new FarmResidentEngine(at);
weatherEngine.tick(at + 500, {
  autonomous: true, night: false, busyResident: null,
  farmNeeds: { dryPlots: 0, ripePlots: 0, water: 5, waterCap: 5, canRust: 0, coopComfort: 80, period: 'noon', weather: 'clear', rainbow: false, day: 6, season: 0 },
});
weatherEngine.tick(at + 1000, {
  autonomous: true, night: false, busyResident: null,
  farmNeeds: { dryPlots: 0, ripePlots: 0, water: 5, waterCap: 5, canRust: 0, coopComfort: 80, period: 'noon', weather: 'rain', rainbow: false, day: 6, season: 0 },
});
assert.equal(weatherEngine.residents.gu.currentActivity, '在小屋屋檐下躲雨聊家常', 'switching to daytime rain updates resident activity immediately');
weatherEngine.tick(at + 1500, {
  autonomous: true, night: false, busyResident: null,
  farmNeeds: { dryPlots: 0, ripePlots: 0, water: 5, waterCap: 5, canRust: 0, coopComfort: 80, period: 'noon', weather: 'clear', rainbow: false, day: 6, season: 0 },
});
assert.notEqual(weatherEngine.residents.gu.currentActivity, '在小屋屋檐下躲雨聊家常', 'clearing up from rain resumes normal sunny activity');

const ambientTalk = load('src/utils/farmAmbientTalk.ts');
const rainTalk = ambientTalk.ambientConversation(['door', 'gu'], [], 'houseDoor houseDoor', false, 0.01, 'rain', false);
assert.ok(rainTalk.some(line => line.text.includes('雨')), 'rain ambient encounter talks about rain');
const rainbowTalk = ambientTalk.ambientConversation(['door', 'gu'], [], 'plaza plaza', false, 0.01, 'clear', true);
assert.ok(rainbowTalk.some(line => line.text.includes('彩虹')), 'rainbow ambient encounter talks about rainbow');

// 6. Town persistence round-trip with visitors state
const restoredTown = town.restoreTownState({ ...town.emptyTownState(), visitors: tiredState }, 2, at);
assert.equal(restoredTown.visitors.sleepDeprivedDay, 5);
assert.equal(restoredTown.visitors.horrorBanishedCount, 1);

// 7. Multi-slot visitor rotation, stay duration, natural departure, manual invite expiry & dismissal
const scheduleDay = new Date(2026, 10, 26, 8, 30).getTime();
const slots = visitors.getTodayVisitorSchedule(vState, scheduleDay);
assert.equal(slots.length, 5, '5 daily visitor windows scheduled');
const uniqueVisitorsToday = new Set(slots.map(s => s.who));
assert.equal(uniqueVisitorsToday.size, 4, 'all 4 normal visitors get a turn within the same day');
for (let i = 1; i < slots.length; i++) {
  assert.notEqual(slots[i].who, slots[i - 1].who, 'consecutive slots never repeat the same visitor');
}
// Quiet gap between slots & overnight quiet period
const quietGapAt = new Date(2026, 10, 26, 10, 15).getTime();
assert.equal(visitors.resolveDailyVisitor(vState, quietGapAt), null, 'visitor departs during quiet gap between slots');
const lateNightAt = new Date(2026, 10, 26, 23, 30).getTime();
assert.equal(visitors.resolveDailyVisitor(vState, lateNightAt), null, 'no scheduled visitor stays overnight');
// Legacy activeDate lock no longer traps the entire day on one visitor
const legacyLocked = { ...vState, activeVisitor: 'dafeiyu', activeDate: '2026-11-26' };
assert.equal(visitors.resolveDailyVisitor(legacyLocked, quietGapAt), null, 'legacy activeDate no longer locks a visitor forever');
// Active slot visit info + polite dismissal without instant respawn
const activeSlotVisit = visitors.resolveVisitorVisit(vState, scheduleDay);
assert.ok(activeSlotVisit && activeSlotVisit.source === 'scheduled' && activeSlotVisit.remainingMinutes > 0);
const dismissed = visitors.dismissActiveVisitor(vState, scheduleDay);
assert.equal(dismissed.departed, activeSlotVisit.who);
assert.equal(visitors.resolveDailyVisitor(dismissed.nextState, scheduleDay), null, 'dismissed visitor leaves immediately and does not respawn in same slot');
// Next slot still brings a fresh visitor
const nextSlotMid = slots[1].startsAt + 15 * 60_000;
assert.equal(visitors.resolveDailyVisitor(dismissed.nextState, nextSlotMid), slots[1].who, 'next slot brings the next visitor after earlier dismissal');
// Manual invite lasts 45 minutes and expires naturally (invite at 10:00 -> expires at 10:45 within 09:45-11:00 gap)
const inviteAt = new Date(2026, 10, 26, 10, 0).getTime();
const invitedState = visitors.inviteVisitorToFarm(vState, 'huangbingqi', inviteAt);
assert.equal(visitors.resolveDailyVisitor(invitedState, inviteAt + 10 * 60_000), 'huangbingqi', 'invited visitor stays during 45-minute window');
assert.equal(visitors.resolveDailyVisitor(invitedState, inviteAt + visitors.MANUAL_INVITE_DURATION_MS + 1000), null, 'invited visitor departs automatically after 45 minutes');
assert.equal(visitors.resolveDailyVisitor(invitedState, slots[1].startsAt + 1000), slots[1].who, 'scheduled slot resumes seamlessly after manual invite ends');
// Persistence preserves manual invite & dismissedSlotKey
const roundTripVisitors = visitors.restoreVisitorState(invitedState);
assert.equal(roundTripVisitors.manualVisitor, 'huangbingqi');
assert.equal(roundTripVisitors.manualExpiresAt, invitedState.manualExpiresAt);

// Clock-skew clamp (never shows 46 min for a 45m invite), preserved lastGreetedSlotKey & mid-slot replacement dismiss
const skewedVisit = visitors.resolveVisitorVisit(invitedState, inviteAt - 25_000);
assert.equal(skewedVisit.remainingMinutes, 45, 'manual invite remainingMinutes clamped to invite duration under clock skew');
const greetedSlot0 = visitors.markVisitorSlotGreeted(vState, activeSlotVisit, scheduleDay);
const otherVisitor = visitors.NORMAL_VISITOR_IDS.find(id => id !== activeSlotVisit.who);
const midSlotInvite = visitors.inviteVisitorToFarm(greetedSlot0, otherVisitor, scheduleDay + 5 * 60_000);
assert.equal(midSlotInvite.lastGreetedSlotKey, activeSlotVisit.slotKey, 'manual invite preserves lastGreetedSlotKey to avoid double-counting');
const dismissMidInvite = visitors.dismissActiveVisitor(midSlotInvite, scheduleDay + 10 * 60_000);
assert.equal(dismissMidInvite.departed, otherVisitor);
assert.notEqual(dismissMidInvite.nextState.dismissedSlotKey, activeSlotVisit.slotKey, 'dismissing an invited guest does not falsely dismiss an unrelated scheduled visitor');
// Canonical visitor names & whaleSync.enabled=false fallback in arrival/farewell lines
assert.ok(visitors.visitorArrivalLine('huboqi').includes('胡波奇'));
assert.ok(visitors.visitorFarewellLine('huangbingqi').includes('黄冰骑'));
assert.ok(visitors.visitorArrivalLine('dafeiyu', { ...customSync, enabled: false }).includes('大肥鱼'));
assert.ok(!visitors.visitorArrivalLine('dafeiyu', { ...customSync, enabled: false }).includes('阿顾'));
assert.ok(visitors.visitorFarewellLine('dafeiyu', { enabled: true, persona: { ...customSync.persona, userName: '' } }).includes('大爹'));

console.log('PASS: 120 visitor sprite cells (including Dafeiyu), multi-slot visitor rotation & departure, schedule persona/memory sync, horror Dark Xu Shuiyin, and nighttime sleep/emo system verified');

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
    if (name === '@/store/useWhalePet') return {};
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

const emotion = load('src/utils/farmEmotion.ts');
const sleep = load('src/utils/farmSleep.ts');
const events = load('src/utils/farmRandomEvents.ts');
const ambient = load('src/utils/farmAmbientTalk.ts');
const memory = load('src/utils/farmMemory.ts');
const town = load('src/utils/farmTown.ts');

const now = new Date(2026, 10, 25, 22, 30).getTime();

// 1. Validate 4D numerical emotion system (baselines, delta, clamping, decay, pose mapping, whale sync)
const doorInit = emotion.createInitialFarmEmotion('door', now);
assert.ok(doorInit.joy >= 0 && doorInit.joy <= 100);
const doorHappy = emotion.applyFarmEmotionDelta(doorInit, 'door', { joy: 30, energy: 20, reason: '大丰收' }, now);
assert.equal(emotion.describeFarmEmotion(doorHappy).pose, 'happy');
const doorAngry = emotion.applyFarmEmotionDelta(doorInit, 'door', { calm: -60, joy: -30, reason: '被吵醒' }, now);
assert.equal(emotion.describeFarmEmotion(doorAngry).pose, 'angry');
const doorSad = emotion.applyFarmEmotionDelta(doorInit, 'door', { joy: -40, calm: 5, reason: '雨夜伤感' }, now);
assert.equal(emotion.describeFarmEmotion(doorSad).pose, 'sad');
const doorSleepy = emotion.applyFarmEmotionDelta(doorInit, 'door', { energy: -50, reason: '熬夜' }, now);
assert.equal(emotion.describeFarmEmotion(doorSleepy).pose, 'sleepy');
const decayed = emotion.decayFarmEmotion(doorHappy, 'door', now + 6 * 3600_000);
assert.ok(decayed.joy < doorHappy.joy && decayed.reason === '', 'emotion decays smoothly back toward baseline');

// Dafeiyu loves rain & bridges PAD whale emotion cleanly
const fishRain = emotion.weatherEmotionPulse('dafeiyu', 'rain', false, 'noon');
assert.ok((fishRain.joy ?? 0) > 10, 'Dafeiyu gains joy on rainy days');
const bridged = emotion.whaleEmotionToFarmEmotion(
  { pleasure: 65, arousal: 45, dominance: 10, reason: '刚吃完白米饭', updatedAt: now },
  { fullness: 92, mood: 95, bond: 70, lastSeenAt: now },
  undefined,
  now,
);
assert.equal(emotion.describeFarmEmotion(bridged).pose, 'happy');

// Memory persistence preserves 4D numerical emotion
const mems = memory.restoreFarmMemories({
  gu: { affinity: 40, turns: [], emotion: { joy: 88, energy: 77, calm: 90, social: 80, reason: '收到花束', updatedAt: now } },
});
assert.equal(mems.gu.emotion.joy, 88);
assert.equal(mems.gu.emotion.reason, '收到花束');

// 2. Multi-room & double-bed sleep system
assert.equal(sleep.FARM_ROOM_IDS.length, 4);
assert.equal(sleep.FARM_ROOMS.master.bedType, 'double');
assert.deepEqual([...sleep.FARM_ROOMS.master.occupants], ['door', 'gu']);
assert.equal(sleep.FARM_ROOMS.master.sleepSlots.length, 2, 'master bedroom double bed holds both door and gu');
const grouped = sleep.sleepersByRoom(['door', 'gu', 'xiaoba', 'yujie', 'weigang']);
assert.deepEqual(grouped.master, ['door', 'gu']);
assert.deepEqual(grouped.xiaoba, ['xiaoba']);
assert.deepEqual(grouped.yujie, ['yujie']);
assert.deepEqual(grouped.weigang, ['weigang']);
const nap = sleep.resolvePlayerSleep({ mode: 'nap', currentGrowthNow: now, epoch: now - 86400_000 });
assert.equal(nap.jumpMs, 3 * 3600_000);
const full = sleep.resolvePlayerSleep({ mode: 'full', currentGrowthNow: now, epoch: now - 86400_000 });
assert.ok(full.jumpMs > 3 * 3600_000);

// 3. Random events pool, weather filtering, no-repeat & persistence
assert.ok(events.FARM_RANDOM_EVENTS.length >= 16);
const rainEv = events.pickFarmRandomEvent({
  state: events.emptyRandomEventState(),
  weather: 'rain',
  rainbow: false,
  period: 'noon',
  activeVisitor: 'dafeiyu',
  at: now,
  roll: 0.99,
  force: true,
});
assert.ok(rainEv && (rainEv.weather === 'rain' || rainEv.weather === 'any'));
const rainbowEv = events.pickFarmRandomEvent({
  state: events.emptyRandomEventState(),
  weather: 'clear',
  rainbow: true,
  period: 'morning',
  at: now,
  roll: 0.1,
  force: true,
});
assert.ok(rainbowEv && (rainbowEv.weather === 'rainbow' || rainbowEv.weather === 'clear' || rainbowEv.weather === 'any'));
const restoredTown = town.restoreTownState({
  ...town.emptyTownState(),
  whaleSyncEnabled: false,
  randomEventsEnabled: true,
  emotionSpritesEnabled: true,
  tuckedIn: { day: 3, ids: ['door', 'gu'] },
  randomEvents: { activeEventId: rainEv.id, activeTriggeredAt: now, lastResolvedAt: now - 5000, recentIds: [rainEv.id], resolvedCount: 2 },
}, 2, now);
assert.equal(restoredTown.whaleSyncEnabled, false);
assert.deepEqual(restoredTown.tuckedIn.ids, ['door', 'gu']);
assert.equal(restoredTown.randomEvents.activeEventId, rainEv.id);

// 4. Weather-driven ambient dialogues differ between rain and rainbow
const rainTalk = ambient.ambientConversation(['door', 'gu'], [], 'houseDoor houseDoor', false, 0.05, 'rain', false);
const rainbowTalk = ambient.ambientConversation(['door', 'gu'], [], 'plaza plaza', false, 0.05, 'clear', true);
assert.ok(rainTalk.length >= 4 && rainbowTalk.length >= 4);
assert.notEqual(rainTalk[0].text, rainbowTalk[0].text, 'rain and rainbow generate distinct weather discussions');

// 5. Validate all 6 newly packed transparent sprite atlases (5 emotion sheets + vertical sleep sheet) & 4 room files
const newAtlases = [
  ['assets/images/farm-runtime/family-emotions-pos.png', 8, 5, 112, 112],
  ['assets/images/farm-runtime/family-emotions-neg.png', 8, 5, 112, 112],
  ['assets/images/farm-runtime/misc-emotions.png', 8, 4, 112, 112],
  ['assets/images/farm-runtime/visitors-emotions-pos.png', 8, 5, 112, 112],
  ['assets/images/farm-runtime/visitors-emotions-neg.png', 8, 5, 112, 112],
  ['assets/images/farm-runtime/farm-sleep-sprites.png', 4, 6, 112, 128],
  ['assets/images/farm-runtime/farm-sleep-heads-night.png', 4, 5, 112, 128],
];
let totalNewCells = 0;
for (const [rel, cols, rows, cw, ch] of newAtlases) {
  const im = PNG.sync.read(fs.readFileSync(path.join(root, rel)));
  assert.equal(im.width, cols * cw, `${rel} width`);
  assert.equal(im.height, rows * ch, `${rel} height`);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let opaque = 0;
      let transparent = 0;
      for (let y = r * ch; y < (r + 1) * ch; y++) {
        for (let x = c * cw; x < (c + 1) * cw; x++) {
          const a = im.data[(y * im.width + x) * 4 + 3];
          if (a >= 180) opaque++;
          if (a === 0) transparent++;
          if (x === c * cw || x === (c + 1) * cw - 1 || y === r * ch || y === (r + 1) * ch - 1) {
            assert.equal(a, 0, `${rel} cell (${r},${c}) border clipped`);
          }
        }
      }
      assert.ok(opaque > 500 && transparent > 1000, `${rel} cell (${r},${c}) valid art & alpha`);
      totalNewCells++;
    }
  }
}
for (const roomFile of [
  'assets/images/farm-house-interior-v2.png',
  'assets/images/farm-house-interior-night-v2.png',
  'assets/images/farm-room-xiaoba-day.webp',
  'assets/images/farm-room-xiaoba-night.webp',
  'assets/images/farm-room-yujie-day.webp',
  'assets/images/farm-room-yujie-night.webp',
  'assets/images/farm-room-weigang-day.webp',
  'assets/images/farm-room-weigang-night.webp',
]) {
  assert.ok(fs.existsSync(path.join(root, roomFile)), `missing room texture: ${roomFile}`);
}

// 6. Enforce asset footprint budget (< 20 MB total across entire assets/ directory!)
function dirSize(dir) {
  let sum = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    sum += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return sum;
}
const totalMB = dirSize(path.join(root, 'assets')) / (1024 * 1024);
assert.ok(totalMB < 20, `assets/ footprint (${totalMB.toFixed(2)} MB) must stay under 20 MB`);

console.log(`PASS: 4D numerical emotions, 4-room double-bed sleep, ${events.FARM_RANDOM_EVENTS.length} random events, weather talks, ${totalNewCells} emotion/sleep sprite cells, and lean assets (${totalMB.toFixed(2)} MB) verified!`);

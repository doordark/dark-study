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

const focus = load('src/utils/farmFocus.ts');
const festivals = load('src/utils/farmFestivals.ts');
const fishing = load('src/utils/farmFishing.ts');
const stories = load('src/utils/farmStories.ts');
const decor = load('src/utils/farmDecor.ts');
const town = load('src/utils/farmTown.ts');
const memory = load('src/utils/farmMemory.ts');

const baseAt = new Date(2026, 10, 27, 20, 30).getTime(); // Friday evening 2026-11-27 20:30
const baseMem = memory.restoreFarmMemories(null);

// 1. Verify unified pixel art sprite sheets & banners integrity
for (const file of ['farm-dishes-fish.png', 'farm-ui-icons.png', 'farm-expansion-props.png']) {
  const im = PNG.sync.read(fs.readFileSync(path.join(root, 'assets/images', file)));
  assert.equal(im.width, 512, `${file} width must be 512`);
  assert.equal(im.height, 256, `${file} height must be 256`);
  assert.equal(im.data[3], 0, `${file} corner must be transparent`);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      let opaque = 0;
      for (let y = row * 128; y < (row + 1) * 128; y++) {
        for (let x = col * 128; x < (col + 1) * 128; x++) {
          if (im.data[(y * im.width + x) * 4 + 3] > 180) opaque++;
        }
      }
      assert.ok(opaque > 800, `${file} cell (${row},${col}) must contain visible sprite art`);
    }
  }
}
for (const banner of ['farm-cover-town.png', 'farm-cover-group.png', 'farm-cover-journal.png', 'farm-cover-market.png', 'farm-residents-orchard.png']) {
  const im = PNG.sync.read(fs.readFileSync(path.join(root, 'assets/images', banner)));
  assert.equal(im.width, 600, `${banner} width must be upgraded to 600`);
  assert.ok(im.height >= 176, `${banner} height must be upgraded`);
}

// 2. Module A: Focus Study Companion Clock
const settled = focus.settleFocusSession({
  stats: focus.emptyFocusStats(),
  memories: baseMem,
  minutes: 25,
  companions: ['door', 'gu'],
  topic: '复习算法',
  at: baseAt,
});
assert.equal(settled.rewardCoins, 40);
assert.equal(settled.rewardCompost, 1);
assert.equal(settled.growthBoostMs, 35 * 60_000);
assert.equal(settled.nextStats.totalSessions, 1);
assert.equal(settled.nextStats.streakDays, 1);
assert.ok((settled.nextMemories.door.episodes ?? []).some(e => e.tags.includes('伴读')));
assert.ok((settled.nextMemories.gu.episodes ?? []).some(e => e.tags.includes('伴读')));

const nextDaySettled = focus.settleFocusSession({
  stats: settled.nextStats,
  memories: settled.nextMemories,
  minutes: 15,
  companions: ['xiaoba'],
  topic: '',
  at: baseAt + 86_400_000,
});
assert.equal(nextDaySettled.nextStats.streakDays, 2, 'consecutive day increments streak');
assert.equal(nextDaySettled.nextStats.totalMinutes, 40);

// 3. Module B: Dynamic Festivals & Campfire Gatherings
const harvestFest = festivals.detectAvailableFestival({ day: 7, seasonIndex: 2, rainbow: false, period: 'evening', at: baseAt });
assert.equal(harvestFest.kind, 'harvest');
const rainbowFest = festivals.detectAvailableFestival({ day: 3, seasonIndex: 0, rainbow: true, period: 'noon', at: baseAt });
assert.equal(rainbowFest.kind, 'rainbow');
const fridayFest = festivals.detectAvailableFestival({ day: 3, seasonIndex: 0, rainbow: false, period: 'evening', at: baseAt });
assert.equal(fridayFest.kind, 'friday_chill');

const party = festivals.hostCampfireGathering({
  festival: harvestFest,
  day: 7,
  memories: settled.nextMemories,
  dishLabel: '田园浓汤',
  at: baseAt,
});
assert.equal(party.affinityBoost, 5, 'serving dish yields +5 affinity');
assert.equal(party.postcard.highlights.length, 6, 'all 6 family members speak around the campfire');
assert.equal(party.townEvent.knownBy.length, 6);
assert.ok(party.postcard.highlights.some(h => h.text.includes('伴读') || h.text.includes('复习算法') || h.text.includes('田园浓汤')));

// 4. Module C: Pond Fishing, Weigang Buddy Bonus, Drift Bottles & Fish Soup
let book = fishing.emptyFishingBook();
const bottleCatch = fishing.rollFishingCatch({ period: 'night', weigangNearby: true, book, roll: 0.05, bottleRoll: 0.1 });
assert.equal(bottleCatch.kind, 'bottle');
assert.equal(bottleCatch.isNewBottle, true);
book = fishing.applyFishingCatch(book, bottleCatch);
assert.equal(book.bottles.length, 1);

const moonCatch = fishing.rollFishingCatch({ period: 'night', weigangNearby: true, book, roll: 0.30 });
assert.equal(moonCatch.kind, 'fish');
assert.equal(moonCatch.fish, 'moonfish');
book = fishing.applyFishingCatch(book, moonCatch);
assert.equal(book.fishStock.moonfish, 1);

const crucianCatch = fishing.rollFishingCatch({ period: 'noon', weigangNearby: false, book, roll: 0.95 });
assert.equal(crucianCatch.kind, 'fish');
assert.equal(crucianCatch.fish, 'crucian');
book = fishing.applyFishingCatch(book, crucianCatch);
const soupRes = fishing.cookFishSoupFromBook(book);
assert.equal(soupRes.ok, true);
assert.equal(soupRes.nextBook.fishStock.crucian, 0);
const soldRes = fishing.sellFishFromBook(soupRes.nextBook, 'moonfish');
assert.equal(soldRes.earned, fishing.FISH_META.moonfish.sell);

// 5. Module D: Personal 5-Act Stories & Family Album
let storyProg = stories.emptyStoryProgress();
const readyMemories = {
  ...settled.nextMemories,
  gu: { ...settled.nextMemories.gu, affinity: 20 },
};
const act1 = stories.nextUnlockableChapter('gu', storyProg, readyMemories);
assert.ok(act1 && act1.act === 1);
const claimed = stories.claimStoryChapter({ who: 'gu', progress: storyProg, memories: readyMemories, day: 7, at: baseAt });
assert.ok(claimed);
assert.equal(claimed.nextProgress.acts.gu, 1);
assert.equal(claimed.nextProgress.album.length, 1);
assert.equal(stories.nextUnlockableChapter('gu', claimed.nextProgress, claimed.nextMemories), null, 'act 2 gated until higher affinity/episodes');

// 6. Module E: Yard Decor & Resident Pass-by Comments
const decorEv = decor.buildDecorAnnouncementEvent('windmill', 'xiaoba', baseAt);
assert.equal(decorEv.hotspot, 'farmRight');
assert.ok(decorEv.detail.includes('小八'));
const nearby = decor.pickNearbyDecorComment('weigang', { x: 128, y: 250 }, ['pond_lantern']);
assert.ok(nearby && nearby.decor.id === 'pond_lantern' && nearby.text.includes('灯笼'));

// 7. Town state persistence round-trip with all Phase 3/4 modules
const richTown = {
  ...town.emptyTownState(),
  focus: nextDaySettled.nextStats,
  postcards: [party.postcard],
  fishing: soldRes.nextBook,
  stories: claimed.nextProgress,
  decor: { owned: ['windmill', 'pond_lantern'], placed: ['pond_lantern'], announced: ['windmill', 'pond_lantern'] },
};
const restored = town.restoreTownState(richTown, 3, baseAt);
assert.equal(restored.focus.totalSessions, 2);
assert.equal(restored.postcards.length, 1);
assert.equal(restored.fishing.bottles.length, 1);
assert.equal(restored.stories.album.length, 1);
assert.deepEqual(restored.decor.placed, ['pond_lantern']);

console.log('PASS: farm art unification & Phase 3/4 expansions (focus, festivals, fishing, stories, decor) verified');

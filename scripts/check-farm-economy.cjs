const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(name, dependencies = {}) {
  const filename = path.resolve(__dirname, '../src/utils/' + name + '.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const target = new Module(filename, module);
  target.require = (name) => dependencies[name] ?? require(name);
  target._compile(compiled.outputText, filename);
  return target.exports;
}
const progress = load('farmProgress');
const e = load('farmEconomy', { './farmProgress': progress });
const personality = load('farmPersonality');
const market = load('farmMarket', { './farmProgress': progress, './farmEconomy': e, './farmPersonality': personality });
const today = new Date(2026, 10, 3, 12).getTime();
const tomorrow = new Date(2026, 10, 4, 12).getTime();

assert.equal(e.migrateCoins(3, 999999), 120, 'old money resets');
assert.equal(e.migrateCoins(undefined, 1000000), 120, 'legacy save resets');
assert.equal(e.migrateCoins(4, 283), 283, 'reload never resets earned money');
assert.equal(e.migrateCoins(4, NaN), 0);
assert.equal(e.migrateCoins(4, -5), 0);
assert.deepEqual(e.restoreSeeds({ radish: 3, berry: 5 }), { ...e.cropRecord(), radish: 3, berry: 5 });
assert.equal(e.restoreSeeds({ wheat: Infinity, tomato: -4 }).wheat, 0);
assert.equal(e.CROP_KINDS.length, 12);
assert.equal(e.isCropKind('toString'), false);
assert.equal(e.isCropKind(null), false);
assert.equal(e.restoreEconomy({ inventory: { radish: null }, orders: { date: progress.realDate(today), claimed: ['radish', 'radish', '__proto__'] } }, today).orders.claimed.length, 1);
assert.equal(e.restoreEconomy({ irrigation: 999 }, today).irrigation, 3);
assert.equal(e.wetDuration(0), 30 * 60000);
assert.equal(e.wetDuration(3), 75 * 60000);
assert.equal(e.irrigationCost(3), 0);

for (const kind of e.CROP_KINDS) {
  const meta = e.CROP_META[kind];
  assert(meta.growMs > 0 && meta.price > 0 && meta.sell > 0);
  const first = e.harvestResult(kind, true, meta.seasons[0], 0);
  assert.equal(first.quantity, meta.yield + 1, 'season adds a unit');
  assert.equal(first.premium, true);
  let total = 0;
  for (let round = 0; round < meta.rounds; round++) {
    const result = e.harvestResult(kind, false, -1, round);
    total += result.quantity;
    assert.equal(result.regrow, round < meta.rounds - 1, 'last harvest frees plot');
  }
  assert(total * meta.sell > meta.price, 'full crop lifetime is profitable even out of season at base price');
  assert.equal(e.marketRate(kind, today), e.marketRate(kind, today));
  assert(e.unitPrice(kind, true, today) > e.unitPrice(kind, false, today));
}

let game = e.restoreEconomy(undefined, today);
const order = e.dailyOrder('radish', today);
game.inventory.radish = { normal: order.quantity, premium: 3 };
assert.equal(e.completeOrder(game, 'star', 1, today), null, 'locked crop orders do not pay');
const before = JSON.stringify(game);
const result = e.completeOrder(game, 'radish', 1, today);
assert(result);
assert.equal(JSON.stringify(game), before, 'transaction does not mutate original state');
assert.equal(result.reward, order.reward);
assert.deepEqual(result.economy.inventory.radish, { normal: 0, premium: 3 }, 'ordinary stock consumed first');
const reloaded = e.restoreEconomy(JSON.parse(JSON.stringify(result.economy)), today);
assert.equal(e.completeOrder(reloaded, 'radish', 1, today), null, 'same order cannot pay twice after reload');
const nextDay = e.restoreEconomy(reloaded, tomorrow);
assert.deepEqual(nextDay.orders.claimed, [], 'real date refreshes orders');
assert.deepEqual(nextDay.inventory, reloaded.inventory, 'new day preserves inventory');
assert(e.completeOrder(nextDay, 'radish', 1, tomorrow), 'next day allows new order');
assert.equal(e.completeOrder(e.restoreEconomy(undefined, today), 'wheat', 1, today), null, 'no reward for missing goods');

const stock = e.restoreInventory();
stock.wheat = { normal: 3, premium: 2 };
assert.equal(e.craft(stock, e.RECIPES[0], 5), null, 'processing requires fee up front');
assert.deepEqual(e.craft(stock, e.RECIPES[0], 6).wheat, { normal: 0, premium: 2 });
assert.equal(stock.wheat.normal, 3, 'processing input stays immutable');
assert.equal(e.craft(stock, e.RECIPES[2], 100), null, 'all recipe inputs required');
assert.equal(e.consume(stock.wheat, 6), null);
assert.equal(e.consume(stock.wheat, -1), null);
assert.equal(e.consume(stock.wheat, 0.5), null);
assert.equal(e.stockValue('wheat', { normal: 2, premium: 1 }, today), e.unitPrice('wheat', false, today) * 2 + e.unitPrice('wheat', true, today));

const gear = market.restoreGear();
const stacks = market.bagStacks({ ...e.cropRecord(), radish: 129 }, e.restoreInventory({ radish: { normal: 65, premium: 1 } }), gear.extras, 2);
assert.deepEqual(stacks.filter(s => s.type === 'seed').map(s => s.count), [64, 64, 1]);
assert.deepEqual(stacks.filter(s => s.type === 'crop').map(s => s.count), [64, 1]);
assert.equal(stacks.find(s => s.type === 'premium').count, 1);
assert.equal(stacks.find(s => s.type === 'compost').count, 2);
assert.equal(gear.hoe, 40);
assert.equal(market.canCapacity(3), progress.waterCapacity(3), 'old water upgrades preserve capacity');
const savedGear = { ...gear, bag: 2, rust: 35, stockWindow: market.marketWindow(today),
  purchased: { 'farmer:radish': 2 }, requests: { farmer: { day: progress.realDate(today), delivered: true } } };
assert.deepEqual(market.restoreGear(JSON.parse(JSON.stringify(savedGear))), savedGear);
assert.deepEqual(market.marketOffers('farmer', today), market.marketOffers('farmer', today + 3000));
assert.notDeepEqual(market.marketOffers('farmer', today), market.marketOffers('farmer', today + 3600000));
const travelerWindows = Array.from({ length: 24 }, (_, i) => today + i * 3600000);
assert(travelerWindows.some(at => market.vendorAvailable('traveler', at)));
assert(travelerWindows.some(at => !market.vendorAvailable('traveler', at)));
for (const at of travelerWindows) {
  assert.equal(market.vendorAvailable('traveler', at), market.vendorAvailable('traveler', at + 3000));
  const offers = market.marketOffers('traveler', at);
  if (market.vendorAvailable('traveler', at)) assert(offers.some(o => o.crop && market.qualityOf(o.crop) >= 2));
  else assert.deepEqual(offers, []);
}
assert(!market.pestAt(44, 100, false));
assert(market.pestAt(45, 100, false));
assert(!market.pestAt(100, 100, true));
let legendaryDays = 0, collectionDays = 0;
for (let day = 0; day < 365; day++) {
  const date = today + day * 86400000;
  const dailyRare = new Set();
  for (let hour = 0; hour < 12; hour++) {
    const at = date + hour * 3600000;
    for (const offer of market.marketOffers('traveler', at)) {
      if (!market.rareOffer(offer)) continue;
      dailyRare.add(offer.id);
      assert.equal(offer.stock, 1);
      assert(market.offerLevel(offer) >= 6);
      assert(offer.price >= Math.round(e.CROP_META[offer.crop].price * 1.9));
      const used = market.restoreGear({ rarePurchases: { day: progress.realDate(at), count: 1 } });
      assert.equal(market.offerRemaining(offer, 'traveler', used, at), 0, 'refresh cannot bypass daily cap');
      assert.equal(market.offerRemaining(offer, 'traveler', market.restoreGear(JSON.parse(JSON.stringify(used))), at), 0);
      assert.equal(market.offerRemaining(offer, 'traveler', used, at + 86400000), 1);
    }
  }
  assert(dailyRare.size <= 1);
  if (dailyRare.has('star')) collectionDays++;
  else if (dailyRare.size) legendaryDays++;
}
assert(collectionDays > 15 && collectionDays < 65, 'collection arrivals remain scarce');
assert(legendaryDays > 70 && legendaryDays < 160);
assert.equal(market.offerLevel({ crop: 'star' }), 9);
console.log('Farm economy checks passed: 12 crops, stacking, gear migration, stock rotation, pests, persistent requests, processing and irrigation.');

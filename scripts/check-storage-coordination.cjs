const assert = require('node:assert/strict');
const disk = new Map(), writes = [];
let pauseWrite, fail = false;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const native = {
  getItem: async key => disk.get(key) ?? null,
  removeItem: async key => { disk.delete(key); },
  setItem: async (key, value) => {
    writes.push([key, value]);
    if (pauseWrite) { const gate = pauseWrite; pauseWrite = null; await gate.promise; }
    if (fail) throw new Error('disk unavailable');
    disk.set(key, value);
  },
};
const load = require('./load-project-ts.cjs')({ '@react-native-async-storage/async-storage': native, 'react-native': { Platform: { OS: 'android' } } });
const { coordinatedJSONStorage } = load('src/utils/storage.ts');
const { setStoredJSON, setStoredText, storageHealth, deferredJSONWriter, getStoredText } = load('src/utils/coordinatedStorage.ts');
const { flushPendingWrites, withPendingWritesSuspended } = load('src/utils/coalescedWriter.ts');
async function main() {
  const storage = coordinatedJSONStorage('legacy');
  disk.set('legacy', JSON.stringify({ state: { count: 1 }, version: 0 }));
  assert.equal((await storage.getItem('new')).state.count, 1);
  let serializations = 0;
  const value = count => ({ state: { count, toJSON() { serializations++; return { count }; } }, version: 0 });
  const a = storage.setItem('new', value(2)), b = storage.setItem('new', value(3));
  await Promise.all([a, b]);
  assert.equal(JSON.parse(disk.get('new')).state.count, 3);
  assert.equal(serializations, 1, 'superseded snapshots are never serialized');
  assert.equal(writes.filter(([key]) => key === 'new').length, 1);

  const gate = deferred(); pauseWrite = gate;
  const previous = setStoredJSON('new', { state: { count: 4 }, version: 0 });
  await Promise.resolve();
  let restoreStarted = false;
  const restore = withPendingWritesSuspended(async () => {
    restoreStarted = true;
    disk.set('new', JSON.stringify({ state: { count: 99 }, version: 0 }));
    // onRehydrateStorage callbacks and delayed pre-restore completions are blocked.
    await setStoredJSON('new', { state: { count: -2 }, version: 0 });
    await setStoredText('voice', '0');
  });
  await setStoredJSON('new', { state: { count: -1 }, version: 0 });
  assert.equal(restoreStarted, false, 'restore waits for an active ordinary store write');
  gate.resolve(); await Promise.all([previous, restore]); await flushPendingWrites();
  assert.equal(JSON.parse(disk.get('new')).state.count, 99, 'stale writes cannot overwrite restored values');
  assert(!disk.has('voice'));
  await setStoredText('voice', '1'); assert.equal(disk.get('voice'), '1', 'writes resume after restore');

  fail = true;
  await assert.rejects(setStoredJSON('broken', { state: { count: 5 }, version: 0 }), /unavailable/);
  assert(storageHealth.getSnapshot().includes('broken'));
  let entered = false;
  await assert.rejects(withPendingWritesSuspended(async () => { entered = true; }), /unavailable/);
  assert.equal(entered, false, 'failed pre-restore flush must prevent the transaction');
  fail = false; await flushPendingWrites();
  assert(!storageHealth.getSnapshot().includes('broken'));
  assert.equal(JSON.parse(disk.get('broken')).state.count, 5, 'failed data is retained for retry');
  const farm = deferredJSONWriter('farm', 1000);
  farm.schedule({ coins: 20 }); farm.schedule({ coins: 30 });
  assert(!disk.has('farm'), 'farm saves remain debounced until a read or flush');
  assert.equal(JSON.parse(await getStoredText('farm')).coins, 30, 'reopening a scene waits for its latest pending save');
  fail = true; farm.schedule({ coins: 40 }); await assert.rejects(farm.flush(), /unavailable/);
  fail = false;
  const reopenedFarm = deferredJSONWriter('farm', 1000);
  reopenedFarm.schedule({ coins: 50 }); await flushPendingWrites();
  assert.equal(JSON.parse(disk.get('farm')).coins, 50, 'reopened scenes supersede failed saves instead of racing old queues');
  await storage.removeItem('new');
  assert(!disk.has('new') && !disk.has('legacy'), 'reset must remove both old and new keys');
  assert.equal(await storage.getItem('new'), null, 'legacy data must not resurrect');
  console.log('PASS: deferred JSON serialization, latest-write coalescing, restore barriers, late-write suppression, failure retention/health/retry and legacy reset');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

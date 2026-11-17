// Exercise the actual hook with virtual timers and storage, without a device or HTTP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let cursor = 0, dirty = false, writes = 0, sequence = 0;
const slots = [], pending = [], intervals = new Map(), timers = new Map(), modules = new Map();
const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const slot = create => { const i = cursor++; return slots[i] ?? (slots[i] = create()); };
const react = {
  useState(initial) {
    const s = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
    s.set ??= value => { const next = typeof value === 'function' ? value(s.value) : value; if (!Object.is(next, s.value)) { s.value = next; dirty = true; writes++; } };
    return [s.value, s.set];
  },
  useRef: value => slot(() => ({ current: value })),
  useCallback(fn, deps) { const s = slot(() => ({})); if (!equal(s.deps, deps)) { s.value = fn; s.deps = deps; } return s.value; },
  useEffect(fn, deps) { const s = slot(() => ({})); if (!equal(s.deps, deps)) pending.push(() => { s.cleanup?.(); s.cleanup = fn(); s.deps = deps; }); },
};
const storage = { getItem: async () => null, setItem: async () => {} };
const timeouts = { set: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clear: id => timers.delete(id) };
function load(file) {
  file = path.resolve(__dirname, '..', file);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} }; modules.set(file, mod);
  const req = name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'react-native-reanimated') return { useReducedMotion: () => false };
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
    if (name === '@/services/farmChat') return { farmChat: () => { throw new Error('unexpected HTTP'); }, FarmChatError: class extends Error {} };
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(file), name + '.ts')));
    return require(name);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', code)(req, mod, mod.exports,
    fn => { const id = ++sequence; intervals.set(id, fn); return id; }, id => intervals.delete(id), timeouts.set, timeouts.clear);
  return mod.exports;
}
async function main() {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
  const { useFarmResidents } = load('src/hooks/useFarmResidents.ts');
  const options = { enabled: true, paused: false, autonomous: true, night: false, apiKey: '',
    memories: load('src/utils/farmMemory.ts').restoreFarmMemories(), scene: { day: 1, season: '春', growing: 0, ripe: 0 }, onWork: () => '完成' };
  let controller;
  function render() { cursor = 0; dirty = false; controller = useFarmResidents(options); pending.splice(0).forEach(fn => fn()); }
  render();
  for (let i = 0; i < 20; i++) { await Promise.resolve(); if (dirty) render(); }
  assert(controller.ready);
  controller.updateSettings({ roaming: false, chatter: false });
  if (dirty) render();
  for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); }
  if (dirty) render();
  assert.equal(intervals.size, 1, 'exactly one simulation scheduler');
  controller.command('gu', { type: 'visit', target: 'market' });
  let notifications = 0;
  const unsubscribe = controller.subscribeResidents(() => notifications++);
  const previous = controller.getResidents();
  writes = 0;
  for (let i = 0; i < 10; i++) { clock += 500; [...intervals.values()].forEach(fn => fn()); }
  assert.equal(notifications, 10, 'the resident layer receives simulation snapshots');
  assert.notEqual(controller.getResidents(), previous);
  assert.notDeepEqual(controller.getResidents().find(r => r.id === 'gu').logicalPosition,
    previous.find(r => r.id === 'gu').logicalPosition, 'the test must exercise real movement');
  assert.equal(writes, 0, 'position-only simulation updates must not set parent React state');
  unsubscribe();
  [...intervals.values()].forEach(fn => fn());
  assert.equal(notifications, 10, 'unmounted resident layers unsubscribe');
  slots.forEach(s => s.cleanup?.());
  assert.equal(intervals.size, 0, 'unmount stops the simulation scheduler');
  console.log('PASS: actual resident hook isolates simulation updates from parent state, notifies subscribers, and cleans up timers');
  } finally { Date.now = realNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

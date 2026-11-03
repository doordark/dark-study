const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const compile = (file, requireFn) => {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(requireFn, mod, mod.exports);
  return mod.exports;
};
const timing = compile('src/utils/atlasTimeline.ts', require);
const bad = timing.atlasTimeline([-1, 999, NaN], 8, 0, 0, [0, -10]);
assert.deepEqual(bad, { frames: [0, 7, 0], holds: [80, 80, 80], total: 240 });
assert.deepEqual(timing.atlasTimeline([], 8).frames, [0]);
assert.equal(timing.atlasTimeline([0, 1], 8, 20, 10, [100, 0, 999]).total, 200);

// Exercise the real component's worklet and effects against a small hook host.
// This catches React rerender resets and lifecycle jumps, not just helper math.
function host(reduced = false) {
  let cursor = 0, slots = [], effects = [], renders = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const slot = (create) => { const i = cursor++; return slots[i] ?? (slots[i] = create()); };
  const memo = (fn, deps) => { const s = slot(() => ({})); if (!equal(s.deps, deps)) { s.value = fn(); s.deps = deps; } return s.value; };
  const react = {
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef: (value) => slot(() => ({ current: value })),
    useEffect: (fn, deps) => { const s = slot(() => ({})); if (!equal(s.deps, deps)) effects.push(() => { s.cleanup?.(); s.cleanup = fn(); s.deps = deps; }); },
  };
  let listener;
  const app = { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove: () => { listener = undefined; } }; } };
  let clock;
  const reanimated = {
    __esModule: true, default: { Image: 'Image' }, useReducedMotion: () => reduced,
    useSharedValue: (value) => slot(() => ({ value, set(next) { this.value = next; } })),
    useAnimatedStyle: (fn) => fn(), runOnJS: (fn) => fn,
    useFrameCallback: (fn) => { clock = slot(() => ({ active: false, setActive(value) { this.active = value; } })); clock.fn = fn; return clock; },
  };
  const { AnimatedAtlas } = compile('src/components/AnimatedAtlas.tsx', (name) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: app, View: 'View' };
    if (name === 'react-native-reanimated') return reanimated;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name === '@/utils/atlasTimeline') return timing;
    throw new Error(name);
  });
  return {
    render(props = {}) { renders++; cursor = 0; const result = AnimatedAtlas({ source: 1, columns: 8, rows: 1, frames: [0,1,2,3,4,5,6,7], width: 40, ...props }); effects.splice(0).forEach(fn => fn()); return result; },
    tick(delta) { if (clock.active) clock.fn({ timeSincePreviousFrame: delta }); },
    state(value) { app.currentState = value; listener(value); },
    get pose() { return slots.find(s => s && s.value && s.value.signature) ? slots[3].value : undefined; },
    get elapsed() { return slots[2].value; },
    get active() { return clock.active; },
    get callback() { return clock.fn; },
    get renders() { return renders; },
  };
}
const player = host();
player.render();
player.tick(null); player.tick(80);
assert.equal(player.elapsed, 80);
const callback = player.callback;
player.render();
assert.equal(player.callback, callback, 'unrelated React renders retain the worklet registration');
assert.equal(player.elapsed, 80, 'equal inline arrays do not reset the clock');
player.state('background'); player.tick(80);
assert.equal(player.active, false); assert.equal(player.elapsed, 80);
player.state('active'); player.tick(null);
assert.equal(player.elapsed, 80, 'foreground does not catch up background time');
player.render({ active: false }); player.tick(80);
assert.equal(player.elapsed, 80);
player.render(); player.tick(null);
assert.equal(player.elapsed, 80, 'active resume preserves phase');
player.render({ frames: [3,4,5] }); assert.equal(player.elapsed, 0, 'changed sequence resets');
const once = host(); once.render({ loop: false });
for (let i = 0; i < 8; i++) once.tick(80);
assert.equal(once.elapsed, 640); assert.equal(once.active, false, 'one-shot callback stops at completion');
const sleep = host(); sleep.render({ loopFrom: 4 });
for (let i = 0; i < 8; i++) sleep.tick(80);
assert.equal(sleep.elapsed, 320, 'intro does not replay in the breathing loop');
const reduced = host(true); reduced.render(); assert.equal(reduced.active, false);
const long = host(); long.render();
for (let i = 0; i < 36000; i++) long.tick(1000/60);
assert.ok(Math.abs(long.elapsed - 320) < 0.001, 'ten minutes at 60Hz has no cumulative phase drift');
assert.equal(long.renders, 1, 'frames never require React renders');

const metrics = JSON.parse(fs.readFileSync(path.join(root, 'assets/animation-sources/atlas-metrics.json')));
for (const meta of metrics) {
  const im = PNG.sync.read(fs.readFileSync(path.join(root, meta.path)));
  assert.equal(im.width, meta.width); assert.equal(im.height, meta.height);
  assert.equal(im.width % meta.columns, 0); assert.equal(im.height % meta.rows, 0);
  assert.ok(Math.max(im.width, im.height) <= 2048);
  const w = im.width / meta.columns, h = im.height / meta.rows;
  for (let row = 0; row < meta.rows; row++) {
    const unique = new Set();
    for (let col = 0; col < meta.columns; col++) {
      const tile = Buffer.alloc(w*h*4); let opaque = 0, transparent = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((row*h+y)*im.width+col*w+x)*4;
        im.data.copy(tile, (y*w+x)*4, i, i+4);
        const a = im.data[i+3];
        opaque += a >= 200; transparent += a === 0;
        if (x === 0 || y === 0 || x === w-1 || y === h-1) assert.equal(a, 0, `${meta.path} cell ${row},${col} is clipped`);
      }
      assert.ok(opaque > w*h*0.08 && transparent > w*h*0.15, 'nonempty figures with real transparent padding');
      unique.add(crypto.createHash('sha256').update(tile).digest('hex'));
    }
    assert.equal(unique.size, meta.columns, `${meta.path}: no duplicated bitmaps in a row`);
  }
}
console.log('PASS: timing validation, rerender stability, pause/resume, reduced motion, one-shot, sleep intro, ten-minute drift, and 224 unique transparent padded cells across seven atlases');

// Deterministic service regression, without credentials, network or a device.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
function loader(mocks = {}, globals = {}) {
  const modules = new Map();
  function load(name, parent = root) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const file = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(parent, name);
    if (modules.has(file)) return modules.get(file);
    const output = {};
    modules.set(file, output);
    const source = ts.transpileModule(fs.readFileSync(file + ".ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(source, {
      exports: output, require: (n) => load(n, path.dirname(file)),
      setTimeout, clearTimeout, AbortController, Uint8Array, ArrayBuffer, Date, URL, Blob,
      __DEV__: false, console, ...globals,
    }, { filename: file });
    return output;
  }
  return load;
}
async function main() {
 const app = { currentState: 'active' };
 const state = { on: true, hydrate: async () => {} };
 const calls = [];
 const load = loader({
  'react-native': { AppState: app },
  '@/store/useWhaleVoice': { useWhaleVoice: { getState: () => state } },
  './whaleSystemVoice': { stopSystemVoice: async () => {}, speakSystem: (...args) => calls.push(args) },
 });
 const voice = load('@/services/whaleVoice');
 assert.equal((await voice.speakWhale('hello')).engine, 'system');
 const previous = calls.at(-1);
 assert(previous[3](previous[2]));
 voice.stopWhaleVoice();
 assert(!previous[3](previous[2]), 'stop invalidates old system playback');
 state.on = false;
 assert.equal((await voice.speakWhale('muted')).engine, 'cancelled');
 state.on = true; app.currentState = 'background';
 assert.equal((await voice.speakWhale('background')).engine, 'cancelled');
 app.currentState = 'active';
 const first = voice.speakWhale('first'), second = voice.speakWhale('second');
 assert.equal((await first).engine, 'cancelled');
 assert.equal((await second).engine, 'system');
 assert(!fs.existsSync(path.resolve(__dirname, '../assets/voice')), 'voice models removed');
 assert(!require('../package.json').dependencies['react-native-sherpa-onnx'], 'native engine removed');
 console.log('System voice: mute, background, stop, supersession and removed model/dependency checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

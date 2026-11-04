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
const tick = () => new Promise((r) => setImmediate(r));
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0, 1, 2, 3, 4]);
function fakeFileSystem() {
  const disk = new Map();
  const dirs = new Set();
  class File {
    constructor(...parts) { this.uri = parts.map((p) => p.uri ?? p).join("/"); }
    get name() { return this.uri.split("/").pop(); }
    get exists() { return disk.has(this.uri); }
    get size() { const v = disk.get(this.uri); return v?.length ?? 0; }
    async text() { return disk.get(this.uri); }
    async write(value) { disk.set(this.uri, value); }
    async move(dest) { disk.set(dest.uri, disk.get(this.uri)); disk.delete(this.uri); this.uri = dest.uri; }
    delete() { disk.delete(this.uri); }
  }
  class Directory {
    constructor(...parts) { this.uri = parts.map((p) => p.uri ?? p).join("/"); }
    get exists() { return dirs.has(this.uri); }
    get size() { return this.list().reduce((n, f) => n + f.size, 0); }
    create() { dirs.add(this.uri); }
    list() { return [...disk.keys()].filter((p) => p.startsWith(this.uri + "/")).map((p) => new File(p)); }
    delete() { this.list().forEach((f) => f.delete()); dirs.delete(this.uri); }
  }
  return { disk, module: { File, Directory, Paths: { cache: "cache" } } };
}

async function cacheChecks() {
  const files = fakeFileSystem();
  const load = loader({ "expo-file-system": files.module });
  const cache = load("./services/whaleVoiceCache");
  const id = cache.voiceCacheIdentity("大爹，我在呢。", "normal", "voice-a");
  const changed = cache.voiceCacheIdentity("阿顾，我在呢。", "normal", "voice-a");
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(changed));
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(cache.voiceCacheIdentity("大爹，我在呢。", "happy", "voice-a")));
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(cache.voiceCacheIdentity("大爹，我在呢。", "normal", "voice-b")));
  assert.equal(await cache.getCachedVoice(id), null);
  const uri = await cache.putCachedVoice(id, mp3);
  assert.equal(await cache.getCachedVoice(id), uri);
  assert.equal(await cache.getCachedVoice(changed), null);
  // Virtual sizes exercise eviction without allocating 120 MB in the test.
  const large = { length: 60 * 1024 * 1024 };
  await cache.clearVoiceCache();
  await cache.putCachedVoice(id, large);
  await cache.putCachedVoice(changed, large);
  assert.equal(await cache.getCachedVoice(id), null);
  assert.ok(await cache.getCachedVoice(changed));
  assert.ok(await cache.getVoiceCacheSize() <= 100 * 1024 * 1024);
  files.disk.set("cache/whale-tts/index.json", "broken JSON");
  const reloaded = loader({ "expo-file-system": files.module })("./services/whaleVoiceCache");
  assert.equal(await reloaded.getCachedVoice(changed), null);
  assert.equal(await reloaded.getVoiceCacheSize(), 0);
  await reloaded.putCachedVoice(changed, mp3);
  assert.ok(await reloaded.getCachedVoice(changed));
  console.log("PASS disk cache: identity isolation, hit/miss, 100 MB LRU, corrupt-index recovery");
}

async function orchestratorChecks() {
  const cache = new Map(), plays = [], spoken = [], requests = [];
  const state = { on: true, hydrate: async () => {} };
  const app = { currentState: "active" };
  const env = { EXPO_PUBLIC_FISH_API_KEY: "fake-test-key" };
  let generate = async (args) => { requests.push(args); return mp3; };
  const load = loader({
    "./whaleOfflineVoice": { generateOfflineSpeech: (text, mood, signal) => generate({ text, mood, signal }), warmWhaleVoice() {}, disposeOfflineVoice() {} },
    "react-native": { AppState: app },
    "@/store/useWhaleVoice": { useWhaleVoice: { getState: () => state } },
    "./whaleVoiceCache": {
      voiceCacheIdentity: (...args) => JSON.stringify(args),
      getCachedVoice: async (id) => cache.get(id) ?? null,
      putCachedVoice: async (id) => { const uri = "file:" + id; cache.set(id, uri); return uri; },
      releaseVoiceUri() {},
    },
    "./whaleAudioPlayer": { whaleAudioPlayer: { stop() {}, dispose() {}, async play(uri, signal, started) { if (!signal.aborted) { plays.push(uri); started(); } } } },
    "./whaleSystemVoice": { stopSystemVoice: async () => {}, speakSystem: (text) => spoken.push(text) },
  });
  const voice = load("./services/whaleVoice");
  assert.equal((await voice.speakWhale("大爹，我在呢。")).engine, "offline");
  assert.equal((await voice.speakWhale("大爹，我在呢。")).engine, "cache");
  assert.equal(requests.length, 1, "cache hit skips local synthesis");
  assert.equal((await voice.speakWhale("阿顾，我在呢。")).engine, "offline");
  assert.ok(plays.at(-1).includes("阿顾"));
  let resolveA, signalA;
  generate = (args) => { signalA = args.signal; return new Promise((r) => { resolveA = r; }); };
  const pending = voice.speakWhale("旧消息 A");
  await tick();
  voice.stopWhaleVoice();
  assert.ok(signalA.aborted);
  generate = async () => mp3;
  await voice.speakWhale("新消息 B");
  const before = plays.length;
  resolveA(mp3); // Simulate a transport ignoring AbortController.
  assert.equal((await pending).engine, "cancelled");
  assert.equal(plays.length, before, "late A must never play after B");
  generate = async () => { throw new Error("Offline engine failed"); };
  const fallback = await voice.speakWhale("新台词验证失败。");
  assert.equal(fallback.engine, "system");
  assert.match(fallback.error, /内置语音不可用/);
  assert.equal(spoken.at(-1), "新台词验证失败。");
  for (const status of ["background", "inactive"]) {
    app.currentState = status;
    const count = plays.length + spoken.length;
    assert.equal((await voice.speakWhale("后台不发声")).engine, "cancelled");
    assert.equal(plays.length + spoken.length, count);
  }
  app.currentState = "active";
  state.on = false;
  assert.equal((await voice.speakWhale("静音不发声")).engine, "cancelled");
  const text = load("./services/whaleVoiceText");
  const cleaned = text.toSpeakable("（尾巴一摆）[angry][whisper] 阿顾！(๑•̀ㅂ•́)و✧ https://example.com");
  assert.equal(cleaned, "阿顾！");
  assert.ok(text.voiceSpeakable("学习。".repeat(200)).length <= 220);
  console.log("PASS shared voice: miss/hit, custom name, stale A/B race, error fallback, lifecycle guard, mute, injection cleaning");
}

async function offlineChecks() {
  const calls = [];
  let finishFirst;
  const audio = { samples: [0, 0.5, -0.5], sampleRate: 24000 };
  const load = loader({
    "react-native-sherpa-onnx/tts": {
      async createTTS() {
        return {
          async generateSpeech(text) {
            calls.push(text);
            if (text === "旧消息") return new Promise((resolve) => { finishFirst = resolve; });
            return audio;
          },
        };
      },
    },
  });
  const { generateOfflineSpeech } = load("./services/whaleOfflineVoice");
  const controller = new AbortController();
  const first = assert.rejects(generateOfflineSpeech("旧消息", "normal", controller.signal), /cancelled/);
  await tick();
  controller.abort();
  const second = generateOfflineSpeech("新消息", "normal", new AbortController().signal);
  await tick();
  assert.deepEqual(calls, ["旧消息"], "native synthesis remains serial after cancellation");
  finishFirst(audio);
  await first;
  const bytes = Buffer.from(await second);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.readUInt32LE(24), 24000);
  assert.equal(bytes.readUInt32LE(40), 6);
  assert.equal(bytes.readInt16LE(46), 16384);
  assert.equal(bytes.readInt16LE(48), -16384);
  console.log("PASS offline synthesis: one-shot native call, serial cancellation, PCM16 WAV");
}

async function playerChecks() {
  const players = [];
  let mode;
  const load = loader({ "expo-audio": {
    setAudioModeAsync: async (value) => { mode = value; },
    createAudioPlayer: () => {
      const p = { removed: 0, listener: null, play() {}, pause() {}, remove() { this.removed++; },
        addListener(_event, callback) { this.listener = callback; return { remove() {} }; } };
      players.push(p);
      return p;
    },
  } });
  const { whaleAudioPlayer: player } = load("./services/whaleAudioPlayer");
  const first = player.play("a.mp3", new AbortController().signal, () => {});
  await tick();
  assert.equal(mode.interruptionMode, "duckOthers");
  assert.equal(mode.shouldPlayInBackground, false);
  player.stop();
  await first;
  assert.equal(players[0].removed, 1);
  let started = 0;
  const second = player.play("b.mp3", new AbortController().signal, () => { started++; });
  await tick();
  players[1].listener({ playing: true });
  players[1].listener({ didJustFinish: true });
  await second;
  assert.equal(started, 1);
  assert.equal(players[1].removed, 1);
  const failed = player.play("bad.mp3", new AbortController().signal, () => {});
  await tick();
  players[2].listener({ error: "decode failed" });
  await assert.rejects(failed, /播放失败/);
  assert.equal(players[2].removed, 1);
  const cancelled = new AbortController();
  cancelled.abort();
  await player.play("cancelled.mp3", cancelled.signal, () => {});
  assert.equal(players.length, 3);
  console.log("PASS audio player: single channel, ducking config, stop/finish/error removal, cancelled load");
}

(async () => { await cacheChecks(); await orchestratorChecks(); await offlineChecks(); await playerChecks(); })().catch((e) => { console.error(e); process.exitCode = 1; });

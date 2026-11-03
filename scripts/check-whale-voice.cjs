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
const response = () => ({ ok: true, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => mp3.buffer });

async function httpChecks() {
  let fetcher = async () => response();
  const load = loader({}, { fetch: (...args) => fetcher(...args), setTimeout: (f, ms) => setTimeout(f, ms === 12000 ? 5 : ms) });
  const { generateFishSpeech } = load("./services/fishAudio");
  const args = { text: "今天也一起加油吧。", mood: "tender", referenceId: "test-voice", apiKey: "fake-test-key", signal: new AbortController().signal };
  fetcher = async (url, options) => {
    assert.equal(url, "https://api.fish.audio/v1/tts");
    assert.equal(options.headers.model, "s2.1-pro-free");
    const body = JSON.parse(options.body);
    assert.equal(body.reference_id, "test-voice");
    assert.equal(body.text, "[relaxed][soft tone] 今天也一起加油吧。");
    assert.equal(body.format, "mp3");
    return response();
  };
  assert.equal((await generateFishSpeech(args)).length, mp3.length);
  for (const status of [400, 401, 402, 403, 404, 422, 429, 500, 503]) {
    fetcher = async () => ({ ok: false, status });
    await assert.rejects(generateFishSpeech(args), /Fish/);
  }
  fetcher = async () => { throw Error("offline"); };
  await assert.rejects(generateFishSpeech(args), /网络/);
  fetcher = async () => ({ ...response(), arrayBuffer: async () => new ArrayBuffer(0) });
  await assert.rejects(generateFishSpeech(args), /空音频/);
  fetcher = async () => ({ ...response(), headers: { get: () => "application/json" } });
  await assert.rejects(generateFishSpeech(args), /不是音频/);
  fetcher = async (_url, { signal }) => new Promise((_r, reject) => signal.addEventListener("abort", () => reject(Error("abort"))));
  await assert.rejects(generateFishSpeech(args), /超时/);
  console.log("PASS Fish HTTP: documented request, errors, offline, empty/invalid response, timeout");
}

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
  const id = cache.voiceCacheIdentity("大爹，我在呢。", "tender", "voice-a");
  const changed = cache.voiceCacheIdentity("阿顾，我在呢。", "tender", "voice-a");
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(changed));
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(cache.voiceCacheIdentity("大爹，我在呢。", "happy", "voice-a")));
  assert.notEqual(cache.voiceCacheKey(id), cache.voiceCacheKey(cache.voiceCacheIdentity("大爹，我在呢。", "tender", "voice-b")));
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
  const state = { on: true, engine: "auto", referenceId: "voice-a", hydrate: async () => {} };
  const app = { currentState: "active" };
  let generate = async (args) => { requests.push(args); return mp3; };
  let key = "fake-test-key";
  const load = loader({
    "react-native": { AppState: app },
    "@/store/useWhaleVoice": { useWhaleVoice: { getState: () => state } },
    "./whaleVoiceCredentials": { getFishApiKey: async () => key },
    "./whaleVoiceCache": {
      voiceCacheIdentity: (...args) => JSON.stringify(args),
      getCachedVoice: async (id) => cache.get(id) ?? null,
      putCachedVoice: async (id) => { const uri = "file:" + id; cache.set(id, uri); return uri; },
      releaseVoiceUri() {},
    },
    "./whaleAudioPlayer": { whaleAudioPlayer: { stop() {}, dispose() {}, async play(uri, signal, started) { if (!signal.aborted) { plays.push(uri); started(); } } } },
    "./whaleSystemVoice": { stopSystemVoice: async () => {}, speakSystem: (text) => spoken.push(text) },
  });
  // Retain real FishAudioError class, replace only synthesis transport.
  const fish = load("./services/fishAudio");
  fish.generateFishSpeech = (args) => generate(args);
  const voice = load("./services/whaleVoice");
  assert.equal((await voice.speakWhale("大爹，我在呢。")).engine, "fish");
  key = null;
  assert.equal((await voice.speakWhale("大爹，我在呢。")).engine, "cache");
  assert.equal(requests.length, 1, "cache hit needs neither key nor HTTP");
  key = "fake-test-key";
  assert.equal((await voice.speakWhale("阿顾，我在呢。")).engine, "fish");
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
  generate = async () => { throw new fish.FishAudioError("Fish 验证失败 / API Key 无效"); };
  const preview = await voice.speakWhale("大爹，我在呢。", { preview: true });
  assert.equal(preview.engine, "system");
  assert.match(preview.error, /Key 无效/);
  assert.equal(spoken.at(-1), "大爹，我在呢。");
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
  assert.ok(text.fishSpeakable("学习。".repeat(200)).length <= 220);
  console.log("PASS shared voice: miss/hit, custom name, stale A/B race, preview key check, fallback, lifecycle guard, mute, injection cleaning");
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

(async () => { await httpChecks(); await cacheChecks(); await orchestratorChecks(); await playerChecks(); })().catch((e) => { console.error(e); process.exitCode = 1; });

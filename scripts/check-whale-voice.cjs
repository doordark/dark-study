// Deterministic regression test for hybrid lightweight DaFeiYu voice routing,
// Edge v2 DRM token generation, cache identity, cancellation, and graceful cute SFX fallback.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../src");

function createLoader(mocks = {}, globals = {}) {
  const modules = new Map();
  function load(name, parent = root) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const file = name.startsWith("@/")
      ? path.join(root, name.slice(2))
      : path.resolve(parent, name);
    if (modules.has(file)) return modules.get(file);
    const output = {};
    modules.set(file, output);
    const source = ts.transpileModule(fs.readFileSync(file + ".ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(
      source,
      {
        exports: output,
        require: (n) => load(n, path.dirname(file)),
        setTimeout,
        clearTimeout,
        AbortController,
        Uint8Array,
        ArrayBuffer,
        DataView,
        Date,
        URL,
        Blob,
        __DEV__: false,
        console,
        ...globals,
      },
      { filename: file },
    );
    return output;
  }
  return load;
}

async function main() {
  const app = { currentState: "active" };
  const platform = { OS: "android" };
  const state = {
    on: true,
    config: {
      engine: "auto",
      breezeVoiceId: "",
      breezeVoiceName: "",
      siliconVoice: "FunAudioLLM/CosyVoice2-0.5B:diana",
      edgeVoice: "zh-CN-XiaoyiNeural",
      fallbackToSystem: false,
    },
    hydrate: async () => {},
  };

  const keys = { breezeblue: null, siliconflow: null };
  const cache = new Map();
  const calls = { system: [], cuteSfx: [], played: [], breeze: [], silicon: [], edge: [] };
  let edgeShouldFail = false;

  const load = createLoader({
    "react-native": { AppState: app, Platform: platform },
    "@/store/useWhaleVoice": { useWhaleVoice: { getState: () => state } },
    "./soundEffects": {
      playWhaleCuteSfx: (mood, text, opts) => {
        calls.cuteSfx.push({ mood, text, opts });
        return "whale_cute_happy";
      },
    },
    "./whaleSystemVoice": {
      stopSystemVoice: async () => {},
      speakSystem: (...args) => calls.system.push(args),
    },
    "./whaleAudioPlayer": {
      whaleAudioPlayer: {
        play: async (uri, signal) => {
          if (signal.aborted) return;
          calls.played.push(uri);
        },
        stop: () => {},
        dispose: () => {},
      },
    },
    "./whaleVoiceCredentials": {
      getTtsApiKey: async (provider) => keys[provider] ?? null,
    },
    "./whaleVoiceCache": {
      voiceCacheIdentity: (provider, voiceId, mood, text) =>
        JSON.stringify([provider, voiceId, mood, text]),
      getCachedVoice: async (id) => cache.get(id) ?? null,
      putCachedVoice: async (id, bytes) => {
        const uri = `file:///cache/${cache.size}.mp3`;
        cache.set(id, uri);
        assert(bytes.length > 0);
        return uri;
      },
      releaseVoiceUri: () => {},
    },
    "./whaleTtsProviders": {
      TtsProviderError: class TtsProviderError extends Error {},
      synthesizeBreezeBlue: async ({ text, voiceId }) => {
        calls.breeze.push({ text, voiceId });
        return new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
      },
      synthesizeSiliconFlow: async ({ text, voice }) => {
        calls.silicon.push({ text, voice });
        return new Uint8Array([0xff, 0xfb, 0x90, 0x00, 5, 6, 7, 8]);
      },
      synthesizeEdgeTts: async ({ text, voice }) => {
        calls.edge.push({ text, voice });
        if (edgeShouldFail) throw new Error("edge offline");
        return new Uint8Array([0xff, 0xfb, 0x90, 0x00, 9, 10, 11, 12]);
      },
    },
  });

  const drm = load("@/services/edgeTtsDrm");
  assert.equal(
    drm.generateSecMsGecV2(1700000000),
    "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2",
    "Edge v2 DRM token matches upstream rany2/edge-tts bit-for-bit",
  );
  assert.equal(
    drm.generateSecMsGecV2(1795520000),
    "96E7ACD65E5AB5EE-54EC7E42942E21AA05DFEE9AD0D11EB7DC78DDE7A473C47C4F0078AD2E7D5F45",
    "Edge v2 DRM token matches second reference vector",
  );

  const voice = load("@/services/whaleVoice");

  // 1. Auto mode with no API keys -> tries Edge少女音 first, caches on second hit
  const r1 = await voice.speakWhale("大爹早安呀！");
  assert.equal(r1.engine, "edge");
  assert.equal(r1.cached, false);
  const r1Cached = await voice.speakWhale("大爹早安呀！");
  assert.equal(r1Cached.engine, "edge");
  assert.equal(r1Cached.cached, true);
  assert.equal(calls.edge.length, 1, "second identical call hits local MP3 cache");

  // 2. Edge failure with fallbackToSystem=false -> graceful cute_sfx (not robotic system voice)
  edgeShouldFail = true;
  const rFallback = await voice.speakWhale("哼，才不是想你呢！");
  assert.equal(rFallback.engine, "cute_sfx");
  assert.equal(calls.cuteSfx.length, 1);
  assert.equal(calls.system.length, 0);

  // 3. Explicit fallbackToSystem=true -> falls back to system voice when cloud fails
  state.config.fallbackToSystem = true;
  const rSysFallback = await voice.speakWhale("测试系统回退");
  assert.equal(rSysFallback.engine, "system");
  assert.equal(calls.system.length, 1);
  const prevSys = calls.system.at(-1);
  assert(prevSys[3](prevSys[2]));
  voice.stopWhaleVoice();
  assert(!prevSys[3](prevSys[2]), "stop invalidates previous system playback");
  state.config.fallbackToSystem = false;

  // 4. BreezeBlue prioritized when API key & voice ID configured
  keys.breezeblue = "brz_test_only";
  state.config.breezeVoiceId = "dafeiyu-jiling";
  const rBreeze = await voice.speakWhale("白米饭在哪里呀？");
  assert.equal(rBreeze.engine, "breezeblue");
  assert.equal(calls.breeze[0].voiceId, "dafeiyu-jiling");

  // 5. SiliconFlow explicit selection
  keys.siliconflow = "sk_test_only";
  state.config.engine = "siliconflow";
  const rSilicon = await voice.speakWhale("今天也辛苦啦！");
  assert.equal(rSilicon.engine, "siliconflow");
  assert.equal(calls.silicon[0].voice, "FunAudioLLM/CosyVoice2-0.5B:diana");

  // 6. Pure cute_sfx mode never hits cloud
  state.config.engine = "cute_sfx";
  const beforeCute = calls.cuteSfx.length;
  const rCute = await voice.speakWhale("困困的想眯一会儿");
  assert.equal(rCute.engine, "cute_sfx");
  assert.equal(calls.cuteSfx.length, beforeCute + 1);

  // 7. Mute, background, and supersession guards
  state.on = false;
  assert.equal((await voice.speakWhale("静音")).engine, "cancelled");
  assert.equal((await voice.previewWhaleVoice("试听强制播报")).engine, "cute_sfx");
  state.on = true;
  app.currentState = "background";
  assert.equal((await voice.speakWhale("后台")).engine, "cancelled");
  app.currentState = "active";
  state.config.engine = "system";
  const first = voice.speakWhale("first");
  const second = voice.speakWhale("second");
  assert.equal((await first).engine, "cancelled");
  assert.equal((await second).engine, "system");

  // 8. Verify bloated offline model & native sherpa-onnx stay removed
  assert(!fs.existsSync(path.resolve(__dirname, "../assets/voice")), "100MB offline voice models stay removed");
  assert(!require("../package.json").dependencies["react-native-sherpa-onnx"], "native sherpa-onnx stays removed");

  console.log("PASS: Hybrid whale voice routing, Edge v2 DRM, MP3 cache, cute SFX fallback, mute/background/supersession checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

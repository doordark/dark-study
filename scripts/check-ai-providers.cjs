const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

function createTestEnv(options = {}) {
  const disk = new Map(options.initialDisk ?? []);
  const secure = new Map(options.initialSecure ?? []);

  const asyncStorage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      disk.set(key, value);
    },
    removeItem: async (key) => {
      disk.delete(key);
    },
    multiGet: async (keys) => keys.map((key) => [key, disk.get(key) ?? null]),
    multiSet: async (rows) => {
      for (const [key, value] of rows) disk.set(key, value);
    },
    multiRemove: async (keys) => {
      for (const key of keys) disk.delete(key);
    },
  };

  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: async (key) => (secure.has(key) ? secure.get(key) : null),
    setItemAsync: async (key, value) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (key) => {
      secure.delete(key);
    },
  };

  const updaterStub = {
    fetchLatestRelease: async () => ({
      version: "9.9.9",
      tagName: "v9.9.9",
      notes: "",
      apkUrl: "https://example.invalid/app.apk",
      apkSize: 1024,
      publishedAt: "",
    }),
    isNewer: () => true,
    createApkDownload: () => ({
      promise: Promise.resolve("file:///cache/app.apk"),
      cancel: () => {},
    }),
    verifyApk: async () => true,
    installApk: async () => {},
  };

  const load = createLoader({
    "@react-native-async-storage/async-storage": asyncStorage,
    "react-native": { Platform: { OS: options.os ?? "android" } },
    "expo-secure-store": secureStore,
    "@/services/updater": updaterStub,
  });

  return { disk, secure, load };
}

async function flushAll(load) {
  const { flushPendingWrites } = load("src/utils/coalescedWriter.ts");
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await flushPendingWrites();
  }
}

function testPresetsAndUrlNormalization() {
  const env = createTestEnv();
  const providers = env.load("src/constants/aiProviders.ts");

  assert.equal(providers.AI_PROVIDER_PRESETS.length, 7);
  for (const id of [
    "deepseek",
    "siliconflow",
    "qwen",
    "gemini",
    "openrouter",
    "ollama",
    "custom",
  ]) {
    assert.equal(providers.isAiProviderId(id), true, `valid provider ${id}`);
  }
  for (const bad of ["", "openai", null, undefined, 123, "__proto__", "constructor"]) {
    assert.equal(providers.isAiProviderId(bad), false, `invalid provider ${String(bad)}`);
  }

  // Fallback on unknown id
  assert.equal(providers.getAiProviderPreset("unknown").id, "deepseek");

  // Exact preset checks
  const ds = providers.getAiProviderPreset("deepseek");
  assert.equal(ds.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(ds.defaultTextModel, "deepseek-flash");
  assert.equal(ds.defaultVisionModel, "deepseek-flash");
  assert.equal(ds.supportsDeepSeekServerTools, true);
  assert.equal(ds.requiresApiKey, true);

  const sf = providers.getAiProviderPreset("siliconflow");
  assert.equal(sf.baseUrl, "https://api.siliconflow.cn/v1");
  assert.equal(sf.defaultTextModel, "Qwen/Qwen3-32B");
  assert.equal(sf.defaultVisionModel, "Qwen/Qwen3-VL-30B-A3B-Instruct");
  assert.equal(sf.supportsDeepSeekServerTools, false);
  assert.equal(sf.requiresApiKey, true);

  const qwen = providers.getAiProviderPreset("qwen");
  assert.equal(qwen.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(qwen.defaultTextModel, "qwen3.8-flash");
  assert.equal(qwen.defaultVisionModel, "qwen3-vl-plus");

  const gemini = providers.getAiProviderPreset("gemini");
  assert.equal(gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(gemini.defaultTextModel, "gemini-3.8-flash");
  assert.equal(gemini.defaultVisionModel, "gemini-3.8-flash");

  const openrouter = providers.getAiProviderPreset("openrouter");
  assert.equal(openrouter.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(openrouter.defaultTextModel, "google/gemini-3.8-flash");
  assert.equal(openrouter.defaultVisionModel, "google/gemini-3.8-flash");

  const ollama = providers.getAiProviderPreset("ollama");
  assert.equal(ollama.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(ollama.defaultTextModel, "qwen3:8b");
  assert.equal(ollama.defaultVisionModel, "qwen3-vl:8b");
  assert.equal(ollama.supportsDeepSeekServerTools, false);
  assert.equal(ollama.requiresApiKey, false);

  const custom = providers.getAiProviderPreset("custom");
  assert.equal(custom.baseUrl, "");
  assert.equal(custom.defaultTextModel, "");
  assert.equal(custom.defaultVisionModel, "");
  assert.equal(custom.supportsDeepSeekServerTools, false);

  // URL normalization
  assert.equal(
    providers.normalizeBaseUrl("  https://api.deepseek.com/v1///  "),
    "https://api.deepseek.com/v1",
  );
  assert.equal(
    providers.normalizeBaseUrl("http://127.0.0.1:11434/v1/"),
    "http://127.0.0.1:11434/v1",
  );
  assert.equal(providers.normalizeBaseUrl("ftp://example.com/v1"), "");
  assert.equal(providers.normalizeBaseUrl("javascript:alert(1)"), "");
  assert.equal(providers.normalizeBaseUrl("file:///etc/passwd"), "");
  assert.equal(providers.normalizeBaseUrl("api.example.com/v1"), "");
  assert.equal(providers.normalizeBaseUrl("https://"), "");
  assert.equal(providers.normalizeBaseUrl("https://bad host.com/v1"), "");

  // Runtime config resolution
  assert.deepEqual(providers.resolveAiRuntimeConfig({}), {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    textModel: "deepseek-flash",
    visionModel: "deepseek-flash",
    supportsServerTools: true,
    requiresApiKey: true,
  });

  assert.deepEqual(
    providers.resolveAiRuntimeConfig({
      aiProvider: "siliconflow",
      aiBaseUrl: "https://custom.sf.example/v1/",
      aiTextModel: "  deepseek-ai/DeepSeek-V3  ",
      aiVisionModel: "",
    }),
    {
      provider: "siliconflow",
      baseUrl: "https://custom.sf.example/v1",
      textModel: "deepseek-ai/DeepSeek-V3",
      visionModel: "Qwen/Qwen3-VL-30B-A3B-Instruct",
      supportsServerTools: false,
      requiresApiKey: true,
    },
  );

  // Custom provider falls back visionModel to textModel when omitted
  assert.deepEqual(
    providers.resolveAiRuntimeConfig({
      aiProvider: "custom",
      aiBaseUrl: "https://gateway.example/v1/",
      aiTextModel: "gpt-4o-mini",
      aiVisionModel: "",
    }),
    {
      provider: "custom",
      baseUrl: "https://gateway.example/v1",
      textModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      supportsServerTools: false,
      requiresApiKey: true,
    },
  );
}

async function testSettingsPersistencePartializeAndMirrorSync() {
  const env = createTestEnv();
  const { useSettings } = env.load("src/store/useSettings.ts");
  const { useUpdateTask } = env.load("src/store/useUpdateTask.ts");

  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  // Defaults
  assert.equal(useSettings.getState().aiProvider, "deepseek");
  assert.equal(useSettings.getState().aiBaseUrl, "");
  assert.equal(useSettings.getState().aiTextModel, "");
  assert.equal(useSettings.getState().aiVisionModel, "");
  assert.equal(useSettings.getState().updateMirrorPrefix, "");

  // Setters + sanitization + mirror sync
  useSettings.getState().setApiKey("sk-must-stay-out-of-async-storage");
  useSettings.getState().setAiProvider("qwen");
  useSettings.getState().setAiBaseUrl("https://proxy.example.com/v1///");
  useSettings.getState().setAiTextModel("  qwen-max \n ");
  useSettings.getState().setAiVisionModel("  qwen-vl-plus  ");
  useSettings.getState().setUpdateMirrorPrefix("https://gh-proxy.com");

  assert.equal(useSettings.getState().aiProvider, "qwen");
  assert.equal(useSettings.getState().aiBaseUrl, "https://proxy.example.com/v1");
  assert.equal(useSettings.getState().aiTextModel, "qwen-max");
  assert.equal(useSettings.getState().aiVisionModel, "qwen-vl-plus");
  assert.equal(useSettings.getState().updateMirrorPrefix, "https://gh-proxy.com/");
  assert.equal(
    useUpdateTask.getState().mirrorPrefix,
    "https://gh-proxy.com/",
    "setUpdateMirrorPrefix must sync immediately into useUpdateTask",
  );

  await flushAll(env.load);

  const persistedRaw = env.disk.get("dark-study-settings");
  assert(persistedRaw, "dark-study-settings must be persisted");
  assert(
    !persistedRaw.includes("sk-must-stay-out-of-async-storage"),
    "apiKey must stay excluded from AsyncStorage",
  );
  const parsed = JSON.parse(persistedRaw);
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed.state, "apiKeyHydrated"), false);
  assert.equal(parsed.state.aiProvider, "qwen");
  assert.equal(parsed.state.aiBaseUrl, "https://proxy.example.com/v1");
  assert.equal(parsed.state.aiTextModel, "qwen-max");
  assert.equal(parsed.state.aiVisionModel, "qwen-vl-plus");
  assert.equal(parsed.state.updateMirrorPrefix, "https://gh-proxy.com/");

  // Invalid inputs sanitized safely
  useSettings.getState().setAiProvider("not-a-provider");
  useSettings.getState().setAiBaseUrl("javascript:alert(1)");
  useSettings.getState().setUpdateMirrorPrefix("ftp://evil.example/");
  assert.equal(useSettings.getState().aiProvider, "deepseek");
  assert.equal(useSettings.getState().aiBaseUrl, "");
  assert.equal(useSettings.getState().updateMirrorPrefix, "");
  assert.equal(useUpdateTask.getState().mirrorPrefix, "");

  // Hydration restores persisted fields & syncs updateMirrorPrefix into useUpdateTask
  const env2 = createTestEnv({
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({
          version: 0,
          state: {
            aiProvider: "openrouter",
            aiBaseUrl: "https://openrouter.ai/api/v1/",
            aiTextModel: "anthropic/claude-3.5-sonnet",
            aiVisionModel: "google/gemini-2.5-pro",
            updateMirrorPrefix: "https://ghfast.top/",
          },
        }),
      ],
    ],
  });
  const s2 = env2.load("src/store/useSettings.ts").useSettings;
  const u2 = env2.load("src/store/useUpdateTask.ts").useUpdateTask;
  await s2.persist.rehydrate();
  await flushAll(env2.load);

  assert.equal(s2.getState().aiProvider, "openrouter");
  assert.equal(s2.getState().aiBaseUrl, "https://openrouter.ai/api/v1");
  assert.equal(s2.getState().aiTextModel, "anthropic/claude-3.5-sonnet");
  assert.equal(s2.getState().aiVisionModel, "google/gemini-2.5-pro");
  assert.equal(s2.getState().updateMirrorPrefix, "https://ghfast.top/");
  assert.equal(
    u2.getState().mirrorPrefix,
    "https://ghfast.top/",
    "rehydrating useSettings must sync updateMirrorPrefix into useUpdateTask",
  );
}

async function testDynamicDeepSeekRouting() {
  const env = createTestEnv();
  const { useSettings } = env.load("src/store/useSettings.ts");
  const ds = env.load("src/services/deepseek.ts");
  await useSettings.persist.rehydrate();

  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({
      url,
      method: init?.method,
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : null,
    });
    if (String(url).endsWith("/models")) {
      return {
        ok: true,
        json: async () => ({ data: [{ id: "m1" }, { id: "m2" }] }),
      };
    }
    if (String(url).endsWith("/tools/search")) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Official Hit",
              url: "https://example.com/a",
              snippet: "snippet",
              summary: "summary",
              rerank_score: 0.95,
            },
          ],
        }),
      };
    }
    if (String(url).endsWith("/tools/fetch")) {
      return {
        ok: true,
        json: async () => ({ title: "Fetched Page", content: "# Hello" }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "mock-ok" }, finish_reason: "stop" }],
      }),
    };
  };

  try {
    // 1. Default DeepSeek official behavior preserved
    await ds.chat([{ role: "user", content: "hi" }], "sk-ds", {
      model: ds.TEXT_MODEL,
    });
    assert.equal(calls[0].url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(calls[0].headers.Authorization, "Bearer sk-ds");
    assert.equal(calls[0].body.model, "deepseek-flash");
    assert.deepEqual(calls[0].body.thinking, { type: "disabled" });

    // DeepSeek agent preserves server tools & thinking
    await ds.chatAgentTurn(
      [
        { role: "user", content: "search news" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "thinking...",
          server_tool_calls: [{ step: 1, calls: [] }],
        },
      ],
      "sk-ds",
      {
        model: ds.TEXT_MODEL,
        thinking: "enabled",
        temperature: 0.8,
        tools: [
          { type: "deepseek_web_search" },
          { type: "deepseek_read_url" },
          {
            type: "function",
            function: {
              name: "manage_schedule",
              description: "edit schedule",
              parameters: { type: "object" },
            },
          },
        ],
      },
    );
    const dsAgentReq = calls[calls.length - 1];
    assert.equal(dsAgentReq.body.tools.length, 3);
    assert.deepEqual(dsAgentReq.body.thinking, { type: "enabled" });
    assert.equal(dsAgentReq.body.temperature, undefined);
    assert.ok(dsAgentReq.body.messages[1].server_tool_calls);

    const dsHits = await ds.deepseekWebSearch("dark study", "sk-ds");
    assert.equal(dsHits.length, 1);
    assert.equal(
      calls[calls.length - 1].url,
      "https://api.deepseek.com/v1/tools/search",
    );

    const dsPage = await ds.deepseekFetchUrl("https://example.com/a", "sk-ds");
    assert.equal(dsPage.title, "Fetched Page");
    assert.equal(
      calls[calls.length - 1].url,
      "https://api.deepseek.com/v1/tools/fetch",
    );

    // 2. SiliconFlow preset: routes text vs vision transparently, strips DeepSeek-only fields
    useSettings.getState().setAiProvider("siliconflow");
    useSettings.getState().setAiBaseUrl("");
    useSettings.getState().setAiTextModel("");
    useSettings.getState().setAiVisionModel("");

    await ds.chat([{ role: "user", content: "hello text" }], "sk-sf", {
      model: ds.TEXT_MODEL,
    });
    const sfTextReq = calls[calls.length - 1];
    assert.equal(sfTextReq.url, "https://api.siliconflow.cn/v1/chat/completions");
    assert.equal(sfTextReq.body.model, "Qwen/Qwen3-32B");
    assert.equal(Object.hasOwn(sfTextReq.body, "thinking"), false);

    await ds.chat(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "parse schedule" },
            ds.imagePart("AAAA", "image/png"),
          ],
        },
      ],
      "sk-sf",
      { model: ds.VISION_MODEL },
    );
    const sfVisionReq = calls[calls.length - 1];
    assert.equal(sfVisionReq.url, "https://api.siliconflow.cn/v1/chat/completions");
    assert.equal(sfVisionReq.body.model, "Qwen/Qwen3-VL-30B-A3B-Instruct");
    assert.equal(Object.hasOwn(sfVisionReq.body, "thinking"), false);

    await ds.chatAgentTurn(
      [
        { role: "user", content: "search news" },
        {
          role: "assistant",
          content: "prev",
          reasoning_content: "internal",
          server_tool_calls: [{ step: 1, calls: [] }],
        },
      ],
      "sk-sf",
      {
        model: ds.TEXT_MODEL,
        thinking: "enabled",
        temperature: 0.7,
        tools: [
          { type: "deepseek_web_search" },
          { type: "deepseek_read_url" },
          {
            type: "function",
            function: {
              name: "manage_schedule",
              description: "edit schedule",
              parameters: { type: "object" },
            },
          },
        ],
      },
    );
    const sfAgentReq = calls[calls.length - 1];
    assert.equal(sfAgentReq.body.model, "Qwen/Qwen3-32B");
    assert.equal(Object.hasOwn(sfAgentReq.body, "thinking"), false);
    assert.equal(sfAgentReq.body.temperature, 0.7);
    assert.equal(sfAgentReq.body.tools.length, 1);
    assert.equal(sfAgentReq.body.tools[0].type, "function");
    assert.equal(Object.hasOwn(sfAgentReq.body.messages[1], "server_tool_calls"), false);
    assert.equal(Object.hasOwn(sfAgentReq.body.messages[1], "reasoning_content"), false);

    // Server-only endpoints skipped when !supportsServerTools (zero network calls)
    const beforeUnsupported = calls.length;
    assert.deepEqual(await ds.deepseekWebSearch("query", "sk-sf"), []);
    await assert.rejects(
      ds.deepseekFetchUrl("https://example.com/a", "sk-sf"),
      /不支持/,
    );
    assert.equal(calls.length, beforeUnsupported);

    // 3. Ollama local provider: works without API key & omits Authorization header
    useSettings.getState().setAiProvider("ollama");
    await ds.chat([{ role: "user", content: "local hello" }], "");
    const ollamaReq = calls[calls.length - 1];
    assert.equal(ollamaReq.url, "http://127.0.0.1:11434/v1/chat/completions");
    assert.equal(ollamaReq.body.model, "qwen3:8b");
    assert.equal(Object.hasOwn(ollamaReq.headers, "Authorization"), false);

    const conn = await ds.testDeepSeekConnection("");
    const ollamaModelsReq = calls[calls.length - 1];
    assert.equal(ollamaModelsReq.url, "http://127.0.0.1:11434/v1/models");
    assert.equal(Object.hasOwn(ollamaModelsReq.headers, "Authorization"), false);
    assert.equal(conn.modelCount, 2);

    // 4. Custom provider validation + explicit model override preservation
    useSettings.getState().setAiProvider("custom");
    useSettings.getState().setAiBaseUrl("");
    useSettings.getState().setAiTextModel("");
    const beforeCustomFail = calls.length;
    await assert.rejects(
      ds.chat([{ role: "user", content: "hi" }], "sk-custom"),
      /接口地址/,
    );
    assert.equal(calls.length, beforeCustomFail);

    useSettings.getState().setAiBaseUrl("https://my-gw.example.com/v1/");
    useSettings.getState().setAiTextModel("my-text-model");
    await ds.chat([{ role: "user", content: "hi" }], "sk-custom");
    const customReq = calls[calls.length - 1];
    assert.equal(customReq.url, "https://my-gw.example.com/v1/chat/completions");
    assert.equal(customReq.body.model, "my-text-model");

    // Explicit non-sentinel model passed by caller is honored verbatim
    await ds.chat([{ role: "user", content: "hi" }], "sk-custom", {
      model: "explicit-override-model",
    });
    assert.equal(calls[calls.length - 1].body.model, "explicit-override-model");

    // testDeepSeekConnection configOverride tests unsaved endpoint
    await ds.testDeepSeekConnection("sk-gem", undefined, {
      aiProvider: "gemini",
      aiBaseUrl: "",
    });
    assert.equal(
      calls[calls.length - 1].url,
      "https://generativelanguage.googleapis.com/v1beta/openai/models",
    );
    assert.equal(calls[calls.length - 1].headers.Authorization, "Bearer sk-gem");
  } finally {
    global.fetch = savedFetch;
  }
}

function testSettingsAndVoiceUiCleanup() {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");

  const settingsSrc = fs.readFileSync(path.join(root, "src/screens/SettingsScreen.tsx"), "utf8");
  assert(
    settingsSrc.includes("如 deepseek-flash / gemini-3.8-flash / qwen3.8-flash"),
    "SettingsScreen must show 2026 text model placeholder",
  );
  assert(
    settingsSrc.includes("输入或粘贴 AIza…（Google AI Studio Key）"),
    "SettingsScreen must show Gemini API key placeholder",
  );
  assert(
    settingsSrc.includes("输入或粘贴 sk-or-…"),
    "SettingsScreen must show OpenRouter API key placeholder",
  );
  assert(
    !settingsSrc.includes("允许大肥鱼参考成绩与空课"),
    "SettingsScreen must remove whaleShareGrades toggle from outer AI card",
  );
  assert(settingsSrc.includes("成绩感知"), "SettingsScreen AI entry subtitle must mention 成绩感知");

  const whaleSettingsSrc = fs.readFileSync(path.join(root, "src/screens/WhaleSettingsScreen.tsx"), "utf8");
  assert(
    whaleSettingsSrc.includes("允许大肥鱼参考成绩与空课") &&
      whaleSettingsSrc.includes("whaleShareGrades"),
    "WhaleSettingsScreen AgentSkillsEditor must host whaleShareGrades toggle",
  );

  const voiceSrc = fs.readFileSync(path.join(root, "src/components/WhaleVoiceSettings.tsx"), "utf8");
  assert(voiceSrc.includes("大肥鱼鱼语"), "WhaleVoiceSettings must retain 大肥鱼鱼语 toggle");
  for (const forbidden of [
    "农场与彩蛋互动音效",
    "恐怖徐睡阴",
    "夜空摘星",
    "放学后三彩蛋",
    "失重",
  ]) {
    assert(!voiceSrc.includes(forbidden), `WhaleVoiceSettings must not contain spoiler/removed text: ${forbidden}`);
  }
}

async function run() {
  testPresetsAndUrlNormalization();
  testSettingsAndVoiceUiCleanup();
  await testSettingsPersistencePartializeAndMirrorSync();
  await testDynamicDeepSeekRouting();
  console.log(
    "PASS: AI provider presets (2026), URL normalization, settings/voice UI cleanup, useSettings persistence/partialize/mirror sync, and deepseek dynamic multi-provider routing verified (zero network)",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

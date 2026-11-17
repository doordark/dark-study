const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Use the actual stores and services, with device storage and the AI transport isolated.
const cache = new Map();
const disk = new Map();
const calls = [];
let response = {};
let transport;
const nativeStorage = {
  getItem: async (key) => disk.get(key) ?? null,
  setItem: async (key, value) => { disk.set(key, value); },
  removeItem: async (key) => { disk.delete(key); },
};
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const target = new Module(filename, module);
  target.paths = module.paths;
  cache.set(filename, target);
  target.require = (request) => {
    if (request === "react-native") return { Platform: { OS: "android" } };
    if (request === "@react-native-async-storage/async-storage") return nativeStorage;
    if (request === "@/services/offlineImport") return {};
    if (request === "@/services/deepseek") return {
      TEXT_MODEL: "mock-text", VISION_MODEL: "mock-vision",
      chatJson: async (messages) => { calls.push(messages); return transport ? transport() : response; },
      chat: async (messages) => { calls.push(messages); return "检索结果"; },
    };
    if (request.startsWith("@/")) return load(`src/${request.slice(2)}.ts`);
    return require(request);
  };
  target._compile(compiled.outputText, filename);
  return target.exports;
}

async function run() {
  const persona = load("src/utils/whalePersona.ts");
  const memory = load("src/utils/whaleMemory.ts");
  const { useWhaleMemory: store } = load("src/store/useWhaleMemory.ts");
  const { useWhalePersona: personaStore } = load("src/store/useWhalePersona.ts");
  await Promise.all([store.persist.rehydrate(), personaStore.persist.rehydrate()]);
  assert.equal(store.getState().hydrated, true);

  const normalized = persona.normalizeWhalePersona({ traits: { tsundere: 1000, warmth: NaN, affection: -20 }, name: "  小鱼  " });
  assert.equal(normalized.traits.tsundere, 100);
  assert.equal(normalized.traits.affection, 1);
  assert.equal(normalized.traits.warmth, 80);
  assert.equal(normalized.name, "小鱼");
  assert.equal(persona.normalizeWhalePersona().description, persona.DEFAULT_WHALE_PERSONA.description);

  const expression = load("src/utils/whaleExpression.ts");
  assert.equal(expression.resolveWhaleSticker("happy", "关于我女友的", "吵架了、冷战了，还是纠结送什么礼物？"), null, "screenshot: serious reply cannot receive a happy sticker");
  assert.equal(expression.resolveWhaleSticker("excited", "我和女友吵架了", "我先听你说"), null);
  assert.equal(expression.resolveWhaleSticker("happy", "你表情包是不是发错了，怎么是开心呢", "刚才那张发得不合适"), null, "correction must not trigger another cheerful sticker");
  assert.equal(expression.resolveWhaleSticker("happy", "我通过考试啦", "好耶，恭喜！"), "happy");
  assert.equal(expression.resolveWhaleSticker("toString", "你好", "你好"), null);
  assert.equal(expression.resolveWhaleSticker(undefined, "你好", "你好"), null, "omitted model decision has no random fallback");
  for (const { key } of persona.WHALE_TRAITS) {
    const low = { ...persona.DEFAULT_WHALE_PERSONA, traits: { ...persona.DEFAULT_WHALE_PERSONA.traits, [key]: 1 } };
    const high = { ...low, traits: { ...low.traits, [key]: 100 } };
    const lo = persona.getWhaleStylePreview(low).find((p) => p.key === key);
    const hi = persona.getWhaleStylePreview(high).find((p) => p.key === key);
    assert.notEqual(lo.behavior, hi.behavior, `${key} changes the concrete behavior`);
    assert.notEqual(lo.reply, hi.reply, `${key} changes the matching example`);
    assert.ok(persona.buildWhalePersonaPrompt(low).includes(lo.reply));
    assert.ok(persona.buildWhalePersonaPrompt(high).includes(hi.reply));
  }

  const user = { id: "user-1", role: "user", content: "我喜欢吃草莓，以后叫我阿顾", timestamp: 100 };
  const updates = [{ key: "饮食偏好", text: "用户喜欢吃草莓", evidence: "我喜欢吃草莓" }];
  let facts = memory.mergeWhaleFacts([], updates, user, 101);
  assert.equal(facts.length, 1);
  assert.equal(memory.mergeWhaleFacts([], [{ ...updates[0], evidence: "喜欢芒果" }], user, 102).length, 0, "invented evidence cannot be saved");
  assert.equal(memory.mergeWhaleFacts([], updates, { ...user, role: "assistant" }, 102).length, 0);
  assert.equal(memory.mergeWhaleFacts([], [{ key: "密码", text: "密码是123", evidence: "密码是123" }], { ...user, content: "密码是123" }, 102).length, 0);
  facts = memory.mergeWhaleFacts(facts, [{ key: "饮食偏好", text: "用户现在喜欢蓝莓", evidence: "喜欢蓝莓" }], { ...user, content: "我现在喜欢蓝莓" }, 103);
  assert.equal(facts.length, 1, "corrections replace the same topic");
  assert.match(facts[0].text, /蓝莓/);
  facts[0].source = "manual";
  assert.equal(memory.mergeWhaleFacts(facts, updates, user, 104)[0].text, facts[0].text, "manual edits cannot be overwritten");

  const budgeted = memory.recentWhaleHistory([
    { role: "assistant", content: "旧消息".repeat(100) },
    { role: "assistant", content: "" }, user,
  ], 50);
  assert.ok(budgeted.reduce((n, m) => n + m.content.length, 0) <= 50);
  assert.equal(budgeted.at(-1).content, user.content);

  store.getState().setMessages([user]);
  store.getState().learn(updates, user, store.getState().revision, 110);
  assert.equal(store.getState().facts.length, 1);
  const originalId = store.getState().facts[0].id;
  store.getState().removeFact(originalId);
  assert.equal(store.getState().messages.length, 0, "deletion removes its recalled source message");
  assert.equal(store.getState().facts.length, 0);

  store.getState().setMessages([user]);
  const revision = store.getState().revision;
  store.getState().clearMemory();
  store.getState().learn(updates, user, revision, 120);
  assert.equal(store.getState().facts.length, 0, "in-flight writes cannot undo forgetting");

  store.getState().setMessages([user]);
  store.getState().setAutoMemory(false);
  store.getState().learn(updates, user, store.getState().revision, 130);
  assert.equal(store.getState().facts.length, 0);
  store.getState().setAutoMemory(true);
  store.getState().saveFact("喜欢简洁的回答");
  const manualId = store.getState().facts[0].id;
  store.getState().saveFact("喜欢详细的回答", manualId);
  assert.equal(store.getState().facts[0].text, "喜欢详细的回答");
  store.getState().removeMessages([user.id]);
  assert.equal(store.getState().facts.length, 1, "unrelated manual memories survive message deletion");

  // Both actual model entry points receive the saved persona and shared facts.
  const ai = load("src/services/ai.ts");
  personaStore.getState().save({ ...persona.DEFAULT_WHALE_PERSONA, name: "泡泡", userName: "阿顾", traits: { ...persona.DEFAULT_WHALE_PERSONA.traits, tsundere: 99 } });
  store.getState().setPetMessages([user]);
  response = { reply: "阿顾，草莓给你留着。", actions: [], action: "wave", memoryUpdates: updates };
  await ai.askWhalePet([user], "test-key");
  assert.match(calls.at(-1)[0].content, /泡泡/);
  assert.match(calls.at(-1)[0].content, /嘴硬|反话/);
  assert.equal(store.getState().facts.length, 2);
  const followup = { id: "user-2", role: "user", content: "你还记得我爱吃什么吗？", timestamp: 200 };
  store.getState().setMessages([followup]);
  response = { reply: "草莓呀", actions: [] };
  const ctx = { schedule: { name: "课表", courses: [], periods: [], totalWeeks: 18 }, schedules: [], weekIndex: 1, persona: "whale" };
  await ai.askAssistant([followup], ctx, "test-key");
  assert.match(calls.at(-1)[0].content, /用户喜欢吃草莓/);
  assert.match(calls.at(-1)[0].content, /阿顾/);
  assert.ok(calls.at(-1).some((m) => m.role === "user" && m.content === followup.content));
  await ai.askAssistant([followup], { ...ctx, persona: undefined }, "test-key");
  assert.doesNotMatch(calls.at(-1)[0].content, /用户喜欢吃草莓/, "ordinary assistant does not receive private whale memories");

  // Actual request boundary: persisted old image-only messages remain visible to the model.
  const oldSticker = { id: "sticker-old", role: "assistant", content: "", sticker: "happy", timestamp: 210 };
  const correction = { id: "correction", role: "user", content: "你表情包是不是发错了，怎么是开心呢", timestamp: 220 };
  const stickerHistory = [oldSticker, correction];
  const serialized = memory.recentWhaleHistory(stickerHistory);
  assert.match(serialized[0].content, /我已发送表情包：happy，开心/);
  assert.equal(oldSticker.content, "", "serialization does not mutate stored images");
  response = { reply: "刚才那张开心表情不合适，我认真听你说。", actions: [], sticker: "excited" };
  const corrected = await ai.askAssistant(stickerHistory, ctx, "test-key");
  assert.equal(corrected.sticker, null);
  assert.ok(calls.at(-1).some((m) => m.role === "assistant" && /我已发送表情包：happy/.test(m.content)));
  assert.match(calls.at(-1)[0].content, /表情包由你决定/);
  response = { reply: "好耶，恭喜！", actions: [], sticker: "happy" };
  const celebration = [{ role: "user", content: "我通过考试啦" }];
  assert.equal((await ai.askAssistant(celebration, ctx, "test-key")).sticker, "happy");
  assert.equal((await ai.askAssistant(celebration, { ...ctx, persona: undefined }, "test-key")).sticker, null);

  // Saving a new preset changes both entry points on the next call, with old history intact.
  for (const preset of [persona.WHALE_PRESETS[1], persona.WHALE_PRESETS[2], persona.WHALE_PRESETS[3]]) {
    const saved = { ...persona.DEFAULT_WHALE_PERSONA, traits: { ...preset.traits } };
    personaStore.getState().save(saved);
    await ai.askAssistant(stickerHistory, ctx, "test-key");
    const expected = persona.buildWhaleBehaviorProfile(saved);
    assert.ok(calls.at(-1)[0].content.includes(expected));
    await ai.askWhalePet(stickerHistory, "test-key");
    assert.ok(calls.at(-1)[0].content.includes(expected));
    assert.ok(calls.at(-1).some((m) => m.role === "assistant" && /我已发送表情包/.test(m.content)));
  }
  store.getState().setMessages([oldSticker]);
  await ai.askWhalePet([correction], "test-key");
  assert.match(calls.at(-1)[0].content, /我已发送表情包：happy/, "other entry recalls the actual sent sticker too");
  // Cancellation race across an asynchronous model call.
  store.getState().clearMemory();
  store.getState().setPetMessages([user]);
  let complete;
  transport = () => new Promise((resolve) => { complete = resolve; });
  const pending = ai.askWhalePet([user], "test-key");
  store.getState().clearMemory();
  complete({ reply: "旧回复", actions: [], memoryUpdates: updates });
  await pending;
  transport = undefined;
  assert.equal(store.getState().facts.length, 0);
  assert.equal(store.getState().petMessages.length, 0);

  store.getState().setMessages([user]);
  store.getState().setActive(false);
  store.getState().archive();
  assert.equal(store.getState().memory.length, 1);
  store.getState().restore();
  store.getState().restore();
  assert.equal(store.getState().messages.length, 1, "restoring does not duplicate messages");

  // Existing installs with only the old three fields keep their conversations.
  disk.set("dark-study-whale-memory", JSON.stringify({ state: { active: true, messages: [user], memory: [] }, version: 0 }));
  await store.persist.rehydrate();
  assert.equal(store.getState().messages[0].id, user.id);
  assert.equal(store.getState().autoMemory, true);
  assert.ok(Array.isArray(store.getState().petMessages));
  console.log("Whale checks passed: persona bounds and preset switching, contextual stickers and correction, image-only and shared history, evidence validation, manual protection, request races, deletion, archive and legacy storage.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

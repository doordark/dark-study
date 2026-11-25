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
    if (request.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), request + '.ts')));
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
  for (const userName of ["妈妈", "大爹", "爸爸", "妈咪"]) {
    const identity = persona.buildWhaleRelationshipPrompt({ ...persona.DEFAULT_WHALE_PERSONA, userName });
    assert.match(identity, /用户在你们的角色关系中是你的家长，你是用户的女儿/);
    assert.ok(identity.includes(JSON.stringify(userName)));
    assert.match(identity, /自定义背景若明确说明称呼只是昵称/);
  }
  for (const userName of ["阿顾", "妈妈的朋友", "大爹粉丝"]) {
    assert.doesNotMatch(persona.buildWhaleRelationshipPrompt({ ...persona.DEFAULT_WHALE_PERSONA, userName }), /用户在你们的角色关系中是你的家长/);
  }
  assert.match(persona.buildWhaleRelationshipPrompt({ ...persona.DEFAULT_WHALE_PERSONA, name: "闺女", userName: "阿顾" }), /不擅自猜测应叫爸爸还是妈妈/);

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
  // Closing the pet must not learn facts from a late transport response.
  let late;
  transport = () => new Promise(resolve => { late = resolve; });
  const cancelledPet = new AbortController();
  const originalFacts = structuredClone(store.getState().facts);
  const cancelledReply = ai.askWhalePet([user], 'test-key', { signal: cancelledPet.signal });
  cancelledPet.abort();
  late({ reply: '过期回复', actions: [], memoryUpdates: updates });
  await assert.rejects(cancelledReply, /取消/);
  assert.deepEqual(store.getState().facts, originalFacts, 'cancelled pet responses must not update long-term memory');
  transport = undefined;
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
  // Changing identity takes effect at the actual request boundary despite past denial.
  const oldIdentity = [{ role: "assistant", content: "谁是你女儿，别乱认亲。" }, { role: "user", content: "女儿，你是我的谁？" }];
  for (const userName of ["妈妈", "大爹", "阿顾"]) {
    const currentPersona = { ...persona.DEFAULT_WHALE_PERSONA, name: "泡泡", userName };
    personaStore.getState().save(currentPersona);
    for (const request of [() => ai.askAssistant(oldIdentity, ctx, "test-key"), () => ai.askWhalePet(oldIdentity, "test-key")]) {
      await request();
      assert.ok(calls.at(-1)[0].content.includes(persona.buildWhaleRelationshipPrompt(currentPersona)));
      assert.match(calls.at(-1)[0].content, /旧关系不能覆盖当前身份/);
    }
  }
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
  assert.equal(store.getState().autoReflect, true);
  assert.ok(Array.isArray(store.getState().petMessages));
  assert.ok(Array.isArray(store.getState().episodes));
  assert.ok(Array.isArray(store.getState().openLoops));
  assert.ok(Array.isArray(store.getState().reflections));

  // New cognitive memory checks: Mem0 delete op, semantic dedup, episodes, open loops, 3D retrieval, PAD emotion & bond.
  const emotion = load("src/utils/whaleEmotion.ts");
  const behavior = load("src/utils/whaleBehavior.ts");
  let emo = emotion.createInitialEmotion(persona.DEFAULT_WHALE_PERSONA, 1_000_000);
  emo = emotion.applyEmotionDelta(emo, { pleasure: 35, arousal: 28, reason: "被夸奖了" }, 1_000_100, persona.DEFAULT_WHALE_PERSONA);
  assert.equal(emotion.describeWhaleEmotion(emo).id, "ecstatic");
  const decayedEmo = emotion.decayWhaleEmotion(emo, 1_000_100 + 24 * 3_600_000, persona.DEFAULT_WHALE_PERSONA);
  assert.ok(decayedEmo.pleasure < emo.pleasure, "PAD emotion decays smoothly toward persona baseline");
  assert.equal(decayedEmo.reason, "", "stale short-term emotion reason clears after 6h");

  let bond = emotion.createInitialBondProfile(1_000_000);
  bond = emotion.recordBondActivity(bond, "chat", 1_000_100);
  assert.equal(bond.chatTurns, 1);
  assert.ok(bond.xp >= 6);
  const stage = emotion.resolveBondStage({ ...bond, xp: 600 }, 80, 10);
  assert.equal(stage.level, 4, "bond stage advances with companionship XP");

  // Mem0 upsert + semantic dedup + delete (respecting manual immutability & evidence check)
  const teaMsg = { id: "u-tea", role: "user", content: "我平时特别爱喝茉莉花茶", timestamp: 300 };
  let f2 = memory.mergeWhaleFacts([], [{ key: "饮品喜好", category: "preference", importance: 7, text: "用户特别爱喝茉莉花茶", evidence: "特别爱喝茉莉花茶" }], teaMsg, 301);
  assert.equal(f2.length, 1);
  assert.equal(f2[0].category, "preference");
  const delMsg = { id: "u-del", role: "user", content: "其实我现在不喝茉莉花茶了", timestamp: 310 };
  f2 = memory.mergeWhaleFacts(f2, [{ op: "delete", key: "饮品喜好", evidence: "不喝茉莉花茶了" }], delMsg, 311);
  assert.equal(f2.length, 0, "Mem0 delete op removes obsolete auto fact when evidenced");
  const manualFact = [{ id: "m-1", key: "饮品喜好", text: "爱喝白开水", source: "manual", updatedAt: 300 }];
  assert.equal(memory.mergeWhaleFacts(manualFact, [{ op: "delete", key: "饮品喜好", evidence: "不喝茉莉花茶了" }], delMsg, 312).length, 1, "manual facts cannot be deleted by auto op");

  // Episodes & prospective open loops
  const examMsg = { id: "u-exam", role: "user", content: "这周五要考数据结构，我有点紧张", timestamp: 400 };
  const eps = memory.mergeWhaleEpisode([], { summary: "用户提到周五考数据结构感到紧张", emotion: "焦虑", importance: 8 }, examMsg, 401);
  assert.equal(eps.length, 1);
  let loops = memory.mergeWhaleOpenLoops([], { topic: "数据结构考试", dueHint: "明天", evidence: "这周五要考数据结构", status: "open" }, examMsg, 401);
  assert.equal(loops.length, 1);
  assert.ok(loops[0].dueAt > 401, "relative dueHint parses into timestamp");
  const promptWithCognition = memory.buildWhaleMemoryPrompt(f2, [], [examMsg], {
    episodes: eps,
    openLoops: loops,
    reflections: [{ id: "ref-1", kind: "insight", text: "考前紧张时喜欢被温柔打气", importance: 8, updatedAt: 400 }],
    now: 402,
  });
  assert.match(promptWithCognition, /数据结构考试/);
  assert.match(promptWithCognition, /考前紧张时喜欢被温柔打气/);
  assert.match(promptWithCognition, /近期重要情景回忆/);

  loops = memory.mergeWhaleOpenLoops(loops, { topic: "数据结构考试", evidence: "考完数据结构啦", status: "resolved" }, { id: "u-done", role: "user", content: "考完数据结构啦！", timestamp: 500 }, 501);
  assert.ok(loops[0].resolvedAt, "resolved status closes matching open loop");

  // Reflection application race protection & manual fact preservation
  store.getState().clearMemory();
  store.getState().setMessages([examMsg]);
  store.getState().saveFact("手动记住的事");
  const manualSavedId = store.getState().facts[0].id;
  store.getState().learnCognitive({
    memoryUpdates: [{ key: "考试", text: "准备数据结构考试", evidence: "考数据结构" }],
    episode: { summary: "聊到数据结构考试有点紧张", emotion: "焦虑", importance: 7 },
    openLoop: { topic: "数据结构考试", dueHint: "周五", evidence: "这周五要考数据结构", status: "open" },
    moodShift: { pleasure: -6, arousal: 8, reason: "担心用户考前太紧张" },
  }, examMsg, store.getState().revision, 450);
  assert.equal(store.getState().facts.length, 2);
  assert.equal(store.getState().episodes.length, 1);
  assert.equal(store.getState().openLoops.length, 1);
  const autoFactId = store.getState().facts.find((f) => f.source === "auto").id;
  const staleEpoch = store.getState().epoch;
  const staleRev = store.getState().revision;
  store.getState().applyReflection({
    reflections: [{ id: "r1", kind: "insight", text: "考前需要安静鼓励", importance: 8, updatedAt: 460 }],
    prunedFactIds: [manualSavedId, autoFactId],
  }, staleEpoch, staleRev, 460);
  assert.equal(store.getState().reflections.length, 1);
  assert.equal(store.getState().facts.length, 1, "pruning drops targeted auto fact but preserves manual fact");
  assert.equal(store.getState().facts[0].id, manualSavedId);

  // Autonomous pet behavior engine checks
  const sampleNow = new Date(2026, 10, 25, 7, 50, 0); // Wed 07:50
  const alert = behavior.findUpcomingCourse({
    id: "s1", name: "测试", kind: "fall", startDate: "2026-09-07", endDate: "2027-01-10", totalWeeks: 18,
    periods: [{ index: 1, label: "1-2", startTime: "08:00", endTime: "09:40" }],
    courses: [{ id: "c1", name: "数据结构", teacher: "王老师", classroom: "A201", weekday: 3, startPeriod: 1, endPeriod: 1, weeks: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], color: "sky" }],
  }, sampleNow, 20);
  assert.ok(alert && alert.name === "数据结构" && alert.minutesUntil === 10, "upcoming course detected accurately");
  const decision = behavior.decideAutonomousBehavior({
    care: { fullness: 80, mood: 80, bond: 60, lastSeenAt: Date.now() },
    persona: persona.DEFAULT_WHALE_PERSONA,
    nearEdge: false,
    hour: 7,
    upcomingCourse: alert,
  });
  assert.equal(decision.kind, "action");
  assert.match(decision.bubble, /数据结构/);

  console.log("Whale checks passed: persona bounds, 4-tier cognitive memory, Mem0 upsert/delete, episodes, open loops, reflections, PAD emotion, bond growth, autonomous pet engine, request races, deletion, archive and legacy storage.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

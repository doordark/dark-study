const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  cache.set(filename, m);
  m.require = name => {
    if (name === '@/services/farmChat') return { farmChat: async () => { throw new Error('mock-disabled'); }, FarmChatError: class extends Error {} };
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    return require(name);
  };
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  );
  return m.exports;
}

const map = load('src/constants/farmMap.ts');
const nav = load('src/utils/farmNavigation.ts');
const space = load('src/utils/farmResidentSpace.ts');
const life = load('src/utils/farmLife.ts');
const memory = load('src/utils/farmMemory.ts');
const persona = load('src/utils/farmPersonaMemory.ts');
const assignment = load('src/utils/farmAssignment.ts');
const actions = load('src/utils/farmActions.ts');
const discussion = load('src/utils/farmDiscussion.ts');
const groupChat = load('src/utils/farmGroupChat.ts');
const { FarmResidentEngine } = load('src/utils/farmResidentAI.ts');

const at = new Date(2026, 10, 25, 14, 0).getTime();

// 1. Persona Memory Stream, Evidence Guard, Privacy Gate & 3-Factor Retrieval
let memories = memory.restoreFarmMemories();
let yujieMem = memories.yujie;
yujieMem = persona.applyPlayerMemoryUpdates(
  yujieMem,
  [
    { key: '音乐偏好', text: '客人喜欢汪苏泷的抒情歌', evidence: '喜欢汪苏泷的抒情歌' },
    { key: '编造事实', text: '客人中了彩票', evidence: '中了五百万' }, // Not in playerText -> rejected
    { key: '敏感凭据', text: '客人的密钥是 sk-secret123', evidence: 'sk-secret123' }, // Credential -> rejected
    { key: '私密心事', text: '客人让我保密关于前任的事', evidence: '保密关于前任的事' }, // Marked private
  ],
  '我很喜欢汪苏泷的抒情歌，另外保密关于前任的事，别告诉别人，顺便记下 sk-secret123',
  at,
  { text: '客人聊起喜欢汪苏泷的抒情歌，让我很投缘。', importance: 8, emotion: 'warm' },
);
assert.equal(yujieMem.playerFacts.length, 2, 'only evidence-backed non-credential facts enter memory');
assert.equal(yujieMem.playerFacts.find(f => f.key === '音乐偏好').privacy, 'private', 'message with 保密 keeps all facts private');
assert.equal(
  persona.formatPersonaMemoryBlock('yujie', yujieMem, { query: '汪苏泷', peers: ['door'], at, includePrivate: false }),
  '',
  'private facts/episodes never leak into NPC-to-NPC or group prompts',
);
assert.match(
  persona.formatPersonaMemoryBlock('yujie', yujieMem, { query: '汪苏泷', peers: ['player'], at, includePrivate: true }),
  /汪苏泷/,
  '1v1 prompt recalls private facts for the same resident',
);

// Public episodes ranking (Recency x Importance x Relevance)
yujieMem = persona.appendEpisode(yujieMem, {
  id: 'ep-old-low', kind: 'chat', text: '聊了聊天气不错', actors: ['player'],
  tags: ['天气'], importance: 2, privacy: 'public', at: at - 72 * 3600000,
});
yujieMem = persona.appendEpisode(yujieMem, {
  id: 'ep-relevant', kind: 'chat', text: '和客人约定下次在院子里一起练汪苏泷的副歌', actors: ['player'],
  tags: ['唱歌', '副歌', '汪苏泷'], importance: 9, privacy: 'public', at: at - 3600000,
});
const retrieved = persona.retrievePersonaMemories(yujieMem, '我们今天练副歌吧', ['player'], at, { includePrivate: false, limit: 2 });
assert.equal(retrieved[0].id, 'ep-relevant', 'high-importance relevant recent episode ranks first');
const roundTripped = memory.restoreFarmMemories(JSON.parse(JSON.stringify({ ...memories, yujie: yujieMem }))).yujie;
assert.deepEqual(roundTripped, yujieMem, 'extended persona memory fields round-trip cleanly in v4 archive');

// 2. Relay Intent Classification & Natural Convey Flow + Bidirectional Memory
assert.equal(assignment.detectRelayIntent('替我夸夸玉洁唱歌真好听'), 'convey');
assert.equal(assignment.detectRelayIntent('帮我跟顾说晚上别等我吃饭'), 'convey');
assert.equal(assignment.detectRelayIntent('帮我问唯刚今晚几点浇水'), 'ask');
assert.equal(assignment.detectRelayIntent('伟刚骂我，帮我去质问他'), 'confront');
assert.equal(assignment.detectRelayIntent('帮我叫小八过来一下'), 'invite');

const conveyInput = assignment.understandAssignment('帮我跟顾说晚上别等我吃饭', 'door', undefined, [], at);
assert(conveyInput?.execute);
assert.equal(conveyInput.execute.target, 'gu');
assert.equal(conveyInput.execute.intent, 'convey');
assert(!/我记住了：找/.test(conveyInput.reply), 'relay acknowledgement uses natural character voice instead of robotic ticket text');

assert(
  discussion.requestBatchOnTopic(
    '晚上别等我吃饭',
    [
      { speaker: 'door', text: '顾，客人让我顺路告诉你晚上别等他吃饭啦。' },
      { speaker: 'gu', text: '好呀，那我把汤温在锅里，他回来热一下就能喝。' },
    ],
    'gu',
    'convey',
  ),
  'natural convey exchange passes topic validation',
);

// End-to-end convey relay emits memory event for BOTH actor & target
const relayEngine = new FarmResidentEngine(at, () => 0);
relayEngine.configure({ ...life.DEFAULT_LIFE, roaming: false, chatter: false, online: false }, at);
relayEngine.residents.door.logicalPosition = { x: 85, y: 247 };
relayEngine.residents.gu.logicalPosition = { x: 101, y: 247 };
assert(relayEngine.command('door', { type: 'talk_to', target: 'gu', purpose: '晚上别等我吃饭', intent: 'convey' }, at).ok);
for (let t = 0; t < 150000; t += 500) relayEngine.tick(at + t, { autonomous: false });
const relayRecord = relayEngine.history.find(r => r.discussion?.kind === 'request');
assert.equal(relayRecord?.requestStatus, 'answered', 'convey relay completes as answered');
const memEvents = relayEngine.drainMemoryEvents();
assert.equal(memEvents.length, 1, 'completed relay emits one memory persistence event');
assert.equal(relayEngine.drainEffects().length, 0, 'memory events stay separate from simulation work/network effects');
memories = persona.recordNpcConversationMemory(memories, memEvents[0].record, memEvents[0].aiMemory, at + 20000);
assert(memories.door.episodes.some(ep => ep.kind === 'relay' && ep.actors.includes('gu')), 'actor remembers relay');
assert(memories.gu.episodes.some(ep => ep.kind === 'relay' && ep.actors.includes('door')), 'target remembers relay');

// 3. Multi-Party Group Chat: Natural Turn-Taking + Presence Isolation + 6-Person Gathering
const groupMembers = ['door', 'gu', 'xiaoba', 'yujie'];
const mentionedOrder = groupChat.selectGroupResponders('@唯刚 和 @玉洁 你们觉得钓鱼难吗？', ['door', 'gu', 'yujie', 'weigang'], memories, [], at);
assert.deepEqual(mentionedOrder.slice(0, 2), ['weigang', 'yujie'], 'directly mentioned members speak first in natural order');

const antiMonopoly = groupChat.selectGroupResponders(
  '今天天气真好',
  ['door', 'gu', 'xiaoba', 'yujie'],
  memories,
  [{ id: '1', speaker: 'yujie', text: '确实', at: at - 2000 }],
  at,
);
assert.notEqual(antiMonopoly[0], 'yujie', 'recent speaker decays so others can naturally chime in');

const parsedGroup = groupChat.parseGroupChatReply(
  JSON.stringify({
    lines: [
      { speaker: 'gu', text: '今天天气刚好，适合晒晒被子。', mood: '开心' },
      { speaker: 'yujie', text: '妈，我顺便把歌词本拿院子里晒晒太阳？', mood: '调皮' },
      { speaker: 'door', text: '晒完别忘了收，傍晚露水重。' },
    ],
    reaction: 'warm',
    memory: { summary: '大家在院子里聊起晒太阳和收东西', importance: 5, impressions: { 'yujie->gu': '妈妈总把家里照顾得妥帖' } },
  }),
  groupMembers,
);
assert(parsedGroup && parsedGroup.lines.length === 3);
assert.equal(
  groupChat.parseGroupChatReply(JSON.stringify({ lines: [{ speaker: 'weigang', text: '我不在场' }] }), groupMembers),
  null,
  'absent residents cannot speak in group chat',
);
assert.equal(
  groupChat.parseGroupChatReply(JSON.stringify({ lines: [{ speaker: 'gu', text: '一' }, { speaker: 'gu', text: '二' }] }), groupMembers),
  null,
  'consecutive duplicate speakers rejected',
);

const beforeAbsent = memories.weigang.episodes?.length ?? 0;
memories = persona.recordGroupChatMemory(memories, groupMembers, '今天院子好暖和', parsedGroup.lines, parsedGroup.memory, at + 50000);
assert(memories.gu.episodes.some(ep => ep.kind === 'group'), 'present members gain group memory');
assert.equal(memories.yujie.peerImpressions?.gu?.note, '妈妈总把家里照顾得妥帖', 'peer impressions update from group chat');
assert.equal(memories.weigang.episodes?.length ?? 0, beforeAbsent, 'absent family member does NOT receive group chat memory');

// Flexible uneven multi-speaker lines & full 6-person family gathering
const unevenBatch = life.readLifeBatch(
  JSON.stringify({
    lines: [
      { speaker: 'gu', text: '今晚吃面还是喝汤？' },
      { speaker: 'yujie', text: '喝汤！热乎！' },
      { speaker: 'door', text: '我都行，帮顾打下手。' },
      { speaker: 'yujie', text: '爸别光说，待会洗菜算你的。' },
      { speaker: 'gu', text: '哈哈，行，那今晚熬锅热汤。' },
      { speaker: 'door', text: '成交，我这就去洗手。' },
      { speaker: 'yujie', text: '那我去喊小八和唯刚！' },
    ],
  }),
  ['gu', 'yujie', 'door'],
  3,
  false,
  true,
  240,
  2,
);
assert(unevenBatch && unevenBatch.lines.length === 7, 'flexible multi-party accepts natural uneven line counts');

const allDiscuss = actions.playerDiscussionCommand('请全家人一起讨论：谁最帅', 'gu');
assert(allDiscuss && allDiscuss.guests.length === 5, 'full family discussion invites all 5 other residents');
const fullFamilyEngine = new FarmResidentEngine(at, () => 0);
fullFamilyEngine.configure({ ...life.DEFAULT_LIFE, roaming: false, chatter: false }, at);
assert(fullFamilyEngine.command('gu', allDiscuss, at).ok, 'all 6 residents gather around plaza without overcrowding failure');
assert.equal(fullFamilyEngine.history[0].participants.length, 6);

// 4. Navigation Smoothing & Global Speech Bubble Non-Overlap Layout
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const routeLen = (start, pts) => pts.reduce((acc, pt, idx) => acc + dist(idx === 0 ? start : pts[idx - 1], pt), 0);
const smoothTestStart = map.WAYPOINTS.houseDoor;
const smoothTestEnd = map.WAYPOINTS.pond;
const smoothRoute = nav.waypointFarmRoute(smoothTestStart, smoothTestEnd);
assert(smoothRoute.length > 0);
let prevPt = nav.safeFarmPoint(smoothTestStart);
for (const pt of smoothRoute) {
  assert(nav.farmSegmentClear(prevPt, pt), 'smoothed waypoint route never cuts through blockers');
  prevPt = pt;
}
assert(dist(prevPt, smoothTestEnd) < 0.1);
assert(routeLen(smoothTestStart, smoothRoute) <= dist(smoothTestStart, smoothTestEnd) * 1.45, 'smoothed route avoids excessive detours');

// Speech bubble layout: 0 overlap, 0 clipping, auto flip below near top edge across phone widths
for (const viewportWidth of [320, 360, 393, 412, 600]) {
  const scale = Math.min(viewportWidth, 520) / map.SCENE_SIZE.width;
  const w = map.SCENE_SIZE.width * scale;
  const h = map.SCENE_SIZE.height * scale;
  const cardWidth = Math.min(w - 12, Math.max(156, Math.min(212, w * 0.56)));
  const positions = [
    { id: 'door', x: 48, y: 92 }, // Very close to top edge -> should flip below (tail === 'top')
    { id: 'gu', x: 75, y: 155 },
    { id: 'xiaoba', x: 92, y: 245 },
    { id: 'yujie', x: 108, y: 247 },
    { id: 'weigang', x: 145, y: 255 },
  ];
  const actors = positions.map(p => ({
    id: p.id,
    footX: p.x * scale,
    footY: p.y * scale,
    left: p.x * scale - 11 * scale,
    top: p.y * scale - 28 * scale - 16,
    width: 22 * scale,
    height: 28 * scale + 16,
  }));
  const inputs = positions.slice(0, 4).map((p, idx) => ({
    id: p.id,
    speakerId: p.id,
    anchorX: p.x * scale,
    anchorY: p.y * scale - 28 * scale - 14,
    footY: p.y * scale,
    text: `这是一段测试长度的农场对话内容，用来验证气泡不重叠、不超出边界，编号 ${idx + 1}。`,
    priority: 100 + idx,
  }));
  const placed = space.layoutFarmSpeechBubbles(inputs, { width: w, height: h, topSafe: 10, bottomSafe: 10 }, actors, cardWidth);
  assert(placed.length >= 3, `at least 3 simultaneous bubbles fit cleanly at width ${viewportWidth}`);
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    assert(a.left >= 5.9 && a.left + a.width <= w - 5.9, 'bubble within horizontal bounds');
    assert(a.top >= 9.9 && a.top + a.height <= h - 9.9, 'bubble within vertical bounds');
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      const separated = a.left + a.width <= b.left + 0.1 || b.left + b.width <= a.left + 0.1 ||
        a.top + a.height <= b.top + 0.1 || b.top + b.height <= a.top + 0.1;
      assert(separated, `bubbles ${a.id} and ${b.id} must NEVER overlap at width ${viewportWidth}`);
    }
  }
  const topDoor = placed.find(p => p.id === 'door');
  if (topDoor && viewportWidth <= 360) {
    assert(topDoor.tail === 'top' || topDoor.tail === 'left' || topDoor.tail === 'right', 'top-edge speaker flips bubble below or to side when top headroom is insufficient');
  }
}

// Explicit tight top-edge test at every viewport width (e.g. resident near roof/top safe zone)
for (const viewportWidth of [320, 393, 520]) {
  const scale = Math.min(viewportWidth, 520) / map.SCENE_SIZE.width;
  const w = map.SCENE_SIZE.width * scale;
  const h = map.SCENE_SIZE.height * scale;
  const cardWidth = Math.min(w - 12, Math.max(156, Math.min(212, w * 0.56)));
  const topActor = { id: 'door', footX: 90 * scale, footY: 45 * scale, left: 79 * scale, top: 10, width: 22 * scale, height: 28 * scale };
  const placed = space.layoutFarmSpeechBubbles(
    [{ id: 'door', speakerId: 'door', anchorX: 90 * scale, anchorY: 22, footY: 45 * scale, text: '站在场景最顶端时，气泡必须自动翻转到下方或侧边，不能被裁切。', priority: 100 }],
    { width: w, height: h, topSafe: 10, bottomSafe: 10 },
    [topActor],
    cardWidth,
  );
  assert.equal(placed.length, 1);
  assert(placed[0].top >= 10 && placed[0].tail !== 'bottom', `top-edge bubble flips below/side at width ${viewportWidth}`);
}

// 5. Memory Book Deletion, Group Chat Persistence, Group Action Extraction & Targeted Resident Interact
const trimmedFacts = persona.removePlayerFact(yujieMem, '音乐偏好');
assert.equal(trimmedFacts.playerFacts.length, 1, 'removePlayerFact deletes selected fact cleanly');
const trimmedEps = persona.removeMemoryEpisode(yujieMem, 'ep-relevant');
assert(!trimmedEps.episodes.some(ep => ep.id === 'ep-relevant'), 'removeMemoryEpisode deletes selected episode cleanly');

const restoredGroup = groupChat.restoreGroupChatState({
  members: ['door', 'gu', 'invalid-id', 'door'],
  messages: [
    { id: 'm1', speaker: 'player', text: '大家好', at },
    { id: 'm2', speaker: 'gu', text: '来喝茶', mood: '开心', at: at + 1 },
    { id: 'bad', speaker: 'hacker', text: 'x', at: at + 2 },
  ],
});
assert.deepEqual(restoredGroup.members, ['door', 'gu']);
assert.equal(restoredGroup.messages.length, 2);
assert.equal(restoredGroup.messages[1].mood, '开心');
assert.deepEqual(groupChat.restoreGroupChatState(null).members, ['door', 'gu', 'xiaoba', 'yujie']);

const waterCmd = groupChat.extractGroupAction('@顾 帮我浇下水', ['door', 'gu', 'xiaoba']);
assert.deepEqual(waterCmd, { actor: 'gu', action: { type: 'water_crops' } });
const relayCmd = groupChat.extractGroupAction('@小八 帮我问问唯刚今晚几点回家', ['door', 'gu', 'xiaoba']);
assert.equal(relayCmd?.actor, 'xiaoba');
assert.equal(relayCmd?.action.type, 'talk_to');
assert.equal(relayCmd?.action.target, 'weigang');
assert.equal(groupChat.extractGroupAction('@顾 别帮我浇水', ['door', 'gu']), null);

// Targeted interact: turns NPC to face player WITHOUT cancelling unrelated residents' conversation
const isoEngine = new FarmResidentEngine(at, () => 0);
isoEngine.configure({ ...life.DEFAULT_LIFE, roaming: false, chatter: true, encounterChance: 100 }, at);
isoEngine.residents.yujie.logicalPosition = { x: 85, y: 247 };
isoEngine.residents.weigang.logicalPosition = { x: 101, y: 247 };
isoEngine.residents.door.logicalPosition = { x: 48, y: 149 };
isoEngine.tick(at, { autonomous: true });
assert.equal(isoEngine.residents.yujie.conversationPartner, 'weigang', 'yujie and weigang start talking');
isoEngine.interact('door', at + 1000, 30);
assert.equal(isoEngine.residents.door.face, -1, 'door turns left to face player at x=30');
assert.equal(isoEngine.residents.yujie.conversationPartner, 'weigang', 'interacting with door does NOT kill unrelated yujie-weigang conversation');
isoEngine.interact('door', at + 1500, 70);
assert.equal(isoEngine.residents.door.face, 1, 'door turns right to face player at x=70');

// Vendor chat reply supports optional memoryUpdates & episode while preserving strict validation
const vendorMod = (() => {
  const filename = path.resolve(root, 'src/services/farmVendorChat.ts');
  const m = new Module(filename, module);
  m.require = name => name === './farmChat' ? { farmChat: async () => '', FarmChatError: class extends Error {} }
    : name === './whaleTools' ? { searchWeb: async () => [] }
    : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')))
    : require(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
})();
const vendorWithMem = vendorMod.readVendorReply(JSON.stringify({
  reply: '记得你爱种蓝莓，这批苗刚到，给你算实惠点。',
  reaction: 'warm',
  action: { type: 'set_discount', discountPercent: 10 },
  memoryUpdates: [{ key: '常种作物', text: '爱种蓝莓', evidence: '蓝莓' }],
  episode: { text: '客人来买蓝莓苗，聊得很愉快', importance: 6 },
}));
assert(vendorWithMem && vendorWithMem.memoryUpdates?.length === 1 && vendorWithMem.episode?.importance === 6);

console.log('Farm memory, relay, group chat, smooth navigation, targeted interact, vendor memory & speech bubble layout checks passed!');

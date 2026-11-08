const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.require = name => name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))) : require(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}
const life = load('src/utils/farmLife.ts'), actions = load('src/utils/farmActions.ts');
const { FarmResidentEngine } = load('src/utils/farmResidentAI.ts');
const { requestBatchOnTopic } = load('src/utils/farmDiscussion.ts');
const { ambientConversation } = load('src/utils/farmAmbientTalk.ts');
const assignments = load('src/utils/farmAssignment.ts');
const memories = load('src/utils/farmMemory.ts');
const at = new Date(2026, 10, 6, 12).getTime();
const instruction = '伟刚骂我，帮我去质问伟刚为什么这样说';
let draft = assignments.understandAssignment('帮我找唯刚', 'xiaoba', undefined, [], at);
assert.equal(draft.task.target, 'weigang'); assert.equal(draft.task.status, 'needs_details'); assert(!draft.execute);
assert.equal(assignments.understandAssignment('今天天气不错', 'xiaoba', draft.task, [], at), null);
draft = assignments.understandAssignment('问他为什么骂我', 'xiaoba', draft.task, [], at + 1);
assert.equal(draft.execute.target, 'weigang'); assert.equal(draft.execute.purpose, '为什么骂我');
const remembered = memories.recordFarmChatTurn({ affinity: 10, turns: [], assignment: draft.task }, { id: 'memory', player: '你好', reply: '你好' });
assert.deepEqual(remembered.assignment, draft.task);
const reopened = memories.restoreFarmMemories({ xiaoba: { ...remembered, assignment: { ...draft.task, engineId: 'test-task' } } }).xiaoba.assignment;
assert.equal(reopened.status, 'interrupted'); assert.equal(reopened.target, 'weigang'); assert.equal(reopened.question, '为什么骂我');
assert(assignments.understandAssignment('你还记得我要你做什么吗', 'xiaoba', reopened, [], at + 2).recall);
assert(!assignments.understandAssignment('你还记得我要你做什么吗', 'xiaoba', reopened, [], at + 2).execute);
assert(assignments.understandAssignment('继续去问', 'xiaoba', reopened, [], at + 3).execute);
const corrected = assignments.understandAssignment('不是唯刚，是玉洁', 'xiaoba', reopened, [], at + 4);
assert.equal(corrected.execute.target, 'yujie'); assert.equal(corrected.execute.purpose, '为什么骂我');
assert(assignments.understandAssignment('先别去了', 'xiaoba', corrected.task, [], at + 5).cancel);
let reverseDraft = assignments.understandAssignment('帮我问一下今晚吃什么', 'xiaoba', undefined, [], at);
assert.equal(reverseDraft.task.status, 'needs_details'); assert.equal(reverseDraft.task.question, '今晚吃什么');
assert.equal(assignments.understandAssignment('找顾', 'xiaoba', reverseDraft.task, [], at + 1).execute.target, 'gu');
assert.equal(assignments.understandAssignment('问唯刚晚饭吃什么', 'xiaoba', undefined, [], at).execute.purpose, '晚饭吃什么');
for (const text of ['帮我打一壶水', '你去池塘散步', '请告诉我为什么下雨', '帮我解释一下这道题', '去找个地方休息']) assert.equal(assignments.understandAssignment(text, 'xiaoba', reopened, [], at), null);
const contextual = assignments.understandAssignment('你去问他为什么这样说', 'xiaoba', undefined, [{ player: '唯刚骂我' }], at);
assert(contextual.execute.purpose.includes('唯刚骂我'));
const beforeDetails = assignments.understandAssignment('找唯刚', 'xiaoba', undefined, [{ player: '唯刚骂我' }], at);
const multiTurn = assignments.understandAssignment('问他为什么这样说', 'xiaoba', beforeDetails.task, [{ player: '唯刚骂我' }, { player: '找唯刚' }], at + 1);
assert(multiTurn.execute.purpose.includes('唯刚骂我'));
const added = assignments.understandAssignment('还有问他什么时候回家', 'xiaoba', draft.task, [], at + 2);
assert(added.execute.purpose.includes('为什么骂我')); assert(added.execute.purpose.includes('什么时候回家'));
const action = actions.playerTalkCommand(instruction, 'xiaoba');
assert.equal(action.target, 'weigang'); assert.equal(action.purpose, instruction);
assert.equal(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '伟刚骂我' }]).target, 'weigang');
assert.match(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '伟刚骂我' }]).purpose, /伟刚骂我/);
assert.equal(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '顾和伟刚骂我' }]), null);
for (const text of ['别去质问伟刚', '如果我让你质问伟刚', '他说你去质问伟刚', '伟刚骂我']) assert.equal(actions.playerTalkCommand(text, 'xiaoba'), null);
assert(actions.playerTalkCommand('帮我告诉伟刚不要骂我', 'xiaoba'));
assert.equal(actions.validateNpcAction({ ...action, purpose: 'x'.repeat(161) }), null);
for (const text of ['帮我问唯刚明天几点浇水', '去找唯刚问他什么时候回家', '请问问唯刚晚上吃什么']) {
  const task = actions.playerTalkCommand(text, 'xiaoba');
  assert.equal(task.type, 'talk_to'); assert.equal(task.target, 'weigang'); assert.equal(task.purpose, text);
}
assert(!requestBatchOnTopic(instruction, [{ speaker: 'xiaoba', text: '客人说被骂。' }, { speaker: 'weigang', text: '骂人的事需要核实。' }, { speaker: 'xiaoba', text: '这件事我会转达。' }, { speaker: 'weigang', text: '今天一起聊游戏地图吧。' }], 'weigang'));
assert(!requestBatchOnTopic('帮我问唯刚明天几点浇水', [{ speaker: 'weigang', text: '浇水我知道，先不说别的。' }], 'weigang'));
assert(requestBatchOnTopic('帮我问唯刚明天几点浇水', [{ speaker: 'weigang', text: '浇水时间我还没定，要先看看土壤。' }], 'weigang'));
assert(!requestBatchOnTopic('问唯刚怎么看这件事', [{ speaker: 'weigang', text: '我知道了。' }], 'weigang'));
for (const pair of [['door', 'gu'], ['xiaoba', 'yujie'], ['weigang', 'door']]) {
  const history = [], openings = new Set();
  for (let i = 0; i < 8; i++) {
    const lines = ambientConversation(pair, history, 'plaza', false, 0);
    assert(!history.slice(-4).some(record => record.lines[0].text === lines[0].text));
    openings.add(lines[0].text);
    history.push({ source: 'encounter', participants: pair, lines });
  }
  assert(openings.size >= 6);
}
function setup(actor, target, online = false) {
  const e = new FarmResidentEngine(at, () => 0);
  e.configure({ ...life.DEFAULT_LIFE, roaming: false, chatter: false, online, aiRatio: online ? 100 : 0, longTalks: true, naturalTalks: true }, at);
  e.residents[actor].logicalPosition = { x: 85, y: 247 };
  e.residents[target].logicalPosition = { x: 101, y: 247 };
  assert(e.command(actor, { type: 'talk_to', target, purpose: instruction }, at).ok);
  assert.equal(e.residents[actor].task.discussion.question, instruction);
  return e;
}
// Every actor/target pair uses the same request pipeline, regardless of personality.
for (const actor of life.RESIDENT_IDS) for (const target of life.RESIDENT_IDS) {
  if (actor === target) continue;
  const e = setup(actor, target);
  for (let t = 0; t < 150000; t += 500) e.tick(at + t, { autonomous: false });
  const record = e.history.find(r => r.discussion?.kind === 'request');
  assert(record?.endedAt); assert.equal(record.source, 'player_command');
  assert.equal(record.discussion.question, instruction); assert.equal(record.lines.length, 2);
  assert(record.lines[0].text.includes('伟刚骂我'));
  assert(!record.lines.some(line => /游戏|钓鱼|音乐|聊了好久/.test(line.text)));
  assert(record.requestOutcome.includes(life.RESIDENTS[target].name));
  assert(record.requestOutcome.includes('还没得到'));
  assert.equal(life.restoreConversations([record])[0].requestOutcome, record.requestOutcome);
}
for (const mode of ['unrelated', 'timeout', 'accepted']) {
  const e = setup('xiaoba', 'weigang', true);
  let supplied = false;
  for (let t = 0; t < 150000; t += 500) {
    e.tick(at + t, { autonomous: false });
    for (const event of e.drainEffects()) if (event.type === 'conversation') {
      supplied = true; assert.equal(event.discussion.question, instruction);
      assert.equal(event.natural, false);
      if (mode !== 'timeout') e.supplyConversation(event.id, Array.from({ length: event.rounds * 2 }, (_, i) => ({ speaker: event.pair[i % 2], text: mode === 'unrelated' ? '今天一起聊游戏地图吧。' : i % 2 ? '骂人的说法还要核实原话。' : '客人说被骂，我先来核实。' })), true, at + t);
    }
  }
  assert(supplied);
  const record = e.history[0]; assert(record.endedAt); assert(record.requestOutcome);
  assert(!record.lines.some(line => line.text.includes('游戏地图')));
  assert.equal(record.online, mode === 'accepted');
}
const cancelled = setup('xiaoba', 'weigang');
for (let t = 0; t < 5000; t += 500) cancelled.tick(at + t, { autonomous: false });
assert(cancelled.command('xiaoba', { type: 'rest' }, at + 5000).ok);
assert.match(cancelled.history[0].requestOutcome, /还没完成/);
for (const actor of ['xiaoba', 'weigang']) {
  const enRoute = setup('xiaoba', 'weigang');
  assert(enRoute.command(actor, { type: 'rest' }, at + 1).ok);
  assert.equal(enRoute.history.length, 1);
  assert.match(enRoute.history[0].requestOutcome, /还没有问到/);
  assert.equal(enRoute.history[0].participants[0], 'xiaoba');
}
const ownedCancellation = setup('xiaoba', 'weigang');
const ownedId = ownedCancellation.residents.xiaoba.task.id;
assert.equal(ownedCancellation.cancelCommand('xiaoba', 'another-task', at + 1), false);
assert.equal(ownedCancellation.residents.xiaoba.task.id, ownedId);
assert.equal(ownedCancellation.cancelCommand('xiaoba', ownedId, at + 2), true);
assert.equal(ownedCancellation.residents.xiaoba.task, null);
assert.equal(ownedCancellation.residents.weigang.task, null);
assert.equal(ownedCancellation.history[0].taskId, ownedId);
console.log('Farm errands passed: aliases, explicit consent, pronoun context, all 30 actor pairs, purpose retention, truthful reports, interruption, online/offline fallback and rejected topic drift.');

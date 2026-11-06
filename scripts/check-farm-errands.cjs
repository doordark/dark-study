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
const at = new Date(2026, 10, 6, 12).getTime();
const instruction = '伟刚骂我，帮我去质问伟刚为什么这样说';
const action = actions.playerTalkCommand(instruction, 'xiaoba');
assert.equal(action.target, 'weigang'); assert.equal(action.purpose, instruction);
assert.equal(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '伟刚骂我' }]).target, 'weigang');
assert.match(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '伟刚骂我' }]).purpose, /伟刚骂我/);
assert.equal(actions.playerTalkCommand('你去质问他', 'xiaoba', [{ player: '顾和伟刚骂我' }]), null);
for (const text of ['别去质问伟刚', '如果我让你质问伟刚', '他说你去质问伟刚', '伟刚骂我']) assert.equal(actions.playerTalkCommand(text, 'xiaoba'), null);
assert(actions.playerTalkCommand('帮我告诉伟刚不要骂我', 'xiaoba'));
assert.equal(actions.validateNpcAction({ ...action, purpose: 'x'.repeat(161) }), null);
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
  assert.equal(record.discussion.question, instruction); assert.equal(record.lines.length, 6);
  assert(record.lines[0].text.includes('伟刚骂我'));
  assert(!record.lines.some(line => /游戏|钓鱼|音乐|聊了好久/.test(line.text)));
  assert(record.requestOutcome.includes(life.RESIDENTS[target].name));
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
console.log('Farm errands passed: aliases, explicit consent, pronoun context, all 30 actor pairs, purpose retention, truthful reports, interruption, online/offline fallback and rejected topic drift.');

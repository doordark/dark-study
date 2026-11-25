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

const town = load('src/utils/farmTown.ts');
const life = load('src/utils/farmLife.ts');
const memory = load('src/utils/farmMemory.ts');
const { FarmResidentEngine } = load('src/utils/farmResidentAI.ts');

const at = new Date(2026, 10, 25, 10, 0).getTime();

// 1. Daily schedules, rain shelter, rainbow gathering & town event hotspot bias
assert.equal(town.residentCurrentSchedule('gu', 'morning', 'clear', false).waypoint, 'farmCenter');
assert.equal(town.residentCurrentSchedule('weigang', 'morning', 'clear', false).waypoint, 'pond');
assert.equal(town.residentCurrentSchedule('chicken', 'night', 'clear', false).waypoint, 'coop');
assert.equal(town.residentCurrentSchedule('gu', 'noon', 'rain', false).waypoint, 'houseDoor', 'rain sends gu under shelter');
assert.equal(town.residentCurrentSchedule('chicken', 'noon', 'rain', false).waypoint, 'coop', 'rain sends chicken to coop');
assert.equal(town.residentCurrentSchedule('yujie', 'evening', 'clear', true).waypoint, 'plaza', 'rainbow gathers residents to plaza');

const concertEvent = {
  id: 'ev-concert',
  title: '今晚广场篝火音乐会',
  detail: '大家打算晚上推玉洁当主唱。',
  kind: 'director',
  knownBy: ['gu'],
  hotspot: 'plaza',
  createdAt: at,
  expiresAt: at + 3600_000,
};
assert.equal(
  town.residentCurrentSchedule('gu', 'morning', 'clear', false, [concertEvent]).waypoint,
  'plaza',
  'resident who knows about hotspot event gravitates to hotspot',
);
assert.equal(
  town.residentCurrentSchedule('weigang', 'morning', 'clear', false, [concertEvent]).waypoint,
  'pond',
  'resident who has NOT heard the rumor keeps normal morning routine',
);

// 2. Thought bubbles respect privacy and reflect farm needs/events
const dryNeeds = {
  dryPlots: 3, ripePlots: 0, water: 2, waterCap: 6, canRust: 30,
  coopComfort: 80, period: 'morning', weather: 'clear', rainbow: false, day: 3, season: 0,
};
const privateOnly = [{ text: '保密的秘密私事', privacy: 'private' }];
const guThought = town.pickResidentThought('gu', dryNeeds, [], privateOnly, 0.8);
assert(!guThought.includes('保密'), 'thought bubble never leaks private memory episodes');
assert.match(town.pickResidentThought('gu', dryNeeds, [], [], 0.2), /干了/, 'gu thinks about dry plots');
assert.match(town.pickResidentThought('door', dryNeeds, [], [], 0.2), /锈/, 'door thinks about rusty watering can');

// 3. Standing duties detection & autonomous helper execution
assert.equal(town.detectDutyCommand('顾以后帮我盯着浇水', 'gu')?.duty, 'water');
assert.equal(town.detectDutyCommand('以后每天帮我修水壶', 'door')?.duty, 'repair');
assert.equal(town.detectDutyCommand('不用帮我浇水了', 'gu')?.duty, null);
assert.equal(town.detectDutyCommand('如果以后帮我浇水会怎样', 'gu'), null);

assert.equal(town.pickAutonomousDutyAction('gu', 'water', dryNeeds, 10)?.waypoint, 'farmCenter');
assert.equal(town.pickAutonomousDutyAction('gu', 'water', { ...dryNeeds, water: 0 }, 10)?.waypoint, 'pond');
assert.equal(town.pickAutonomousDutyAction('gu', 'water', { ...dryNeeds, period: 'night' }, 10), null, 'helpers rest at night');
assert.equal(town.pickAutonomousDutyAction('door', 'repair', dryNeeds, 10)?.waypoint, 'houseDoor');

// End-to-end autonomous duty in FarmResidentEngine
const autoEngine = new FarmResidentEngine(at, () => 0.1);
autoEngine.configure({ ...life.DEFAULT_LIFE, roaming: true, chatter: false }, at);
autoEngine.setTownContext({ duties: { gu: 'water' }, events: [], affinities: { gu: 30 } });
for (const id of life.RESIDENT_IDS) {
  autoEngine.residents[id].nextDecisionAt = id === 'gu' ? at : at + 600_000;
}
autoEngine.tick(at, { autonomous: true, farmNeeds: dryNeeds });
assert.equal(autoEngine.residents.gu.task?.autoDuty, 'water', 'gu autonomously starts watering duty');
let autoWorkEvent = null;
for (let step = 1; step <= 120; step++) {
  autoEngine.tick(at + step * 500, { autonomous: true, farmNeeds: dryNeeds });
  const events = autoEngine.drainAutoWorkEvents();
  if (events.length) {
    autoWorkEvent = events[0];
    assert(autoEngine.completeWork(autoWorkEvent.id, autoWorkEvent.actor, '顺手帮忙浇了 2 块田地。', at + step * 500));
    break;
  }
}
assert(autoWorkEvent && autoWorkEvent.actor === 'gu' && autoWorkEvent.duty === 'water', 'autonomous helper emits autoWorkEvent on arrival');
assert.equal(autoEngine.drainEffects().length, 0, 'autonomous work stays isolated from manual command effects');

// 4. Rumor seeding, privacy guard & Smallville information cascade across encounters
const rumor = town.detectSeedRumorFromChat('今晚我想在广场办个篝火聚会', 'gu', at);
assert(rumor && rumor.knownBy.length === 1 && rumor.knownBy[0] === 'gu' && rumor.hotspot === 'plaza');
assert.equal(town.detectSeedRumorFromChat('保密别告诉别人，今晚办聚会', 'gu', at), null, 'private chat never seeds town rumor');

const step1 = town.propagateTownEvents([rumor], ['gu', 'door'], at + 1000);
assert.equal(step1.diffused.length, 1);
assert.deepEqual(step1.events[0].knownBy, ['gu', 'door']);
const step2 = town.propagateTownEvents(step1.events, ['door', 'yujie'], at + 2000);
assert.deepEqual(step2.events[0].knownBy, ['gu', 'door', 'yujie'], 'rumor cascades across sequential encounters');

// Offline rumor encounter dialogue uses active rumor naturally
const gossipEngine = new FarmResidentEngine(at, () => 0);
gossipEngine.configure({ ...life.DEFAULT_LIFE, roaming: false, chatter: true, encounterChance: 100 }, at);
gossipEngine.setTownContext({ events: [concertEvent] });
gossipEngine.residents.gu.logicalPosition = { x: 85, y: 247 };
gossipEngine.residents.door.logicalPosition = { x: 101, y: 247 };
gossipEngine.tick(at, { autonomous: true });
for (let t = 500; t <= 40000; t += 500) gossipEngine.tick(at + t, { autonomous: false });
assert(
  gossipEngine.history[0]?.lines.some(line => line.text.includes('今晚广场篝火音乐会')),
  'encounter between informed and uninformed resident naturally spreads the town event',
);

// 5. Farm Gazette compilation & v4 town state persistence round-trip
const townState = {
  duties: { gu: 'water', door: 'repair' },
  events: step2.events,
  helperLog: [{ id: 'h1', actor: 'gu', duty: 'water', summary: '顺手帮忙浇了 2 块田地。', at }],
};
const gazette = town.compileFarmGazette({
  day: 3,
  seasonIndex: 0,
  weather: 'clear',
  rainbow: false,
  history: gossipEngine.history,
  town: townState,
  memories: memory.restoreFarmMemories(),
  at,
});
assert(gazette.headline.includes('第 3 天'));
assert(gazette.stories.some(s => s.includes('小镇热议') && s.includes('3/6')));
assert(gazette.stories.some(s => s.includes('农场互助')));
assert(gazette.marketTip.length > 5);

const persisted = { ...townState, gazette };
const restored = town.restoreTownState(JSON.parse(JSON.stringify(persisted)));
assert.deepEqual(restored, persisted, 'FarmTownState round-trips cleanly in v4 save');
assert.equal(
  town.restoreTownState({ events: [{ id: 'bad', title: '阿绿秘密', detail: '隐私', kind: 'rumor', knownBy: ['gu'], createdAt: at, expiresAt: at + 9999 }] }).events.length,
  0,
  'restoreTownState strips sensitive/private entries',
);

console.log('AI Town checks passed: daily schedules, rain shelter, rainbow gathering, thought bubbles, standing duties, autonomous helpers, rumor cascade, Farm Gazette & v4 state round-trip!');

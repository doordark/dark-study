const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(relative){const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename).exports;const m=new Module(filename,module);cache.set(filename,m);m.require=name=>name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))):require(name);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return m.exports;}
const memory=load('src/utils/farmMemory.ts');
const agency=load('src/utils/farmAgency.ts');
const life=load('src/utils/farmLife.ts'),actions=load('src/utils/farmActions.ts'),map=load('src/constants/farmMap.ts'),nav=load('src/utils/farmNavigation.ts');
const {FarmResidentEngine,motionPosition,remainingResidentMotion}=load('src/utils/farmResidentAI.ts');
const {waterFarmPlots}=load('src/utils/farmWatering.ts');
const at=new Date(2026,10,3,12).getTime();
const settings={...life.DEFAULT_LIFE,roaming:false,chatter:false};
function engine(){const e=new FarmResidentEngine(at,()=>0);e.configure({...settings},at);return e;}
function advance(e,from,seconds=90){for(let i=0;i<=seconds*2;i++)e.tick(from+i*500,{autonomous:false});}
for(const [name,preset] of Object.entries(life.PRESETS)){const normalized=life.normalizeLifeSettings(preset);assert.equal(normalized.mode,name);for(const [key,[min,max]] of Object.entries(life.SETTING_RANGES))assert(normalized[key]>=min&&normalized[key]<=max);}
assert.equal(life.normalizeLifeSettings({}).mode,'normal');
assert.equal(life.normalizeLifeSettings({...life.PRESETS.normal,encounterChance:41}).mode,'custom');
const old=life.normalizeLifeSettings({interval:180,roaming:false,chatter:true,online:true,aiMinutes:20,dailyLimit:5});
assert.equal(old.conversationCooldown,180);assert.equal(old.online,true);assert.equal(old.mode,'custom');
for(const [key,[min,max]] of Object.entries(life.SETTING_RANGES)){assert.equal(life.normalizeLifeSettings({[key]:-1})[key],min);assert.equal(life.normalizeLifeSettings({longTalks:true,[key]:999999})[key],max);assert(Number.isFinite(life.normalizeLifeSettings({[key]:Infinity})[key]));}
assert.equal(life.reserveLifeRequest(life.normalizeLifeUsage(null,at),{...old,dailyLimit:0},at),null);
assert.equal(life.reserveLifeRequest(life.normalizeLifeUsage(null,at),{...old,online:false},at),null);
const reserved=life.reserveLifeRequest(life.normalizeLifeUsage(null,at),old,at);assert.equal(reserved.count,1);assert.equal(life.reserveLifeRequest(reserved,old,at+1000),null);
assert.equal(life.reserveLifeRequest({...reserved,count:5},old,at+3600000),null);
assert.equal(life.reserveLifeRequest(reserved,old,at-1),null);
const restored=life.restoreConversations([{speaker:'door',text:'先歇会。',at},{speaker:'gu',text:'我陪你。',at:at+500},null,{participants:['hacker'],lines:[]}]);
assert.equal(restored.length,1);assert.deepEqual(restored[0].participants,['door','gu']);assert.equal(restored[0].source,'scheduled/local');
assert.deepEqual(life.restoreConversations(JSON.parse(JSON.stringify(restored))),restored);
for(let i=0;i<life.RESIDENT_IDS.length;i++)for(const b of life.RESIDENT_IDS.slice(i+1)){const a=life.RESIDENT_IDS[i];assert(life.LOCAL_SCENES.filter(s=>s.pair.includes(a)&&s.pair.includes(b)).length>=3);}
assert.equal(life.localConversation(['gu','yujie'],6,0).length,12);
assert.equal(life.normalizeLifeSettings({ rounds: 10 }).rounds, 6);
assert.equal(life.normalizeLifeSettings({ longTalks: true, rounds: 10 }).rounds, 10);
for (const first of life.RESIDENT_IDS) for (const second of life.RESIDENT_IDS) {
  if (first === second) continue;
  const pair = [first, second];
  const lines = life.localConversation(pair, 30, 1);
  assert.equal(new Set(lines.map(line => line.text)).size, 60);
  assert(life.readLifeReply(JSON.stringify({ lines }), pair, 30));
  const conversation = { id: 'long', participants: pair, startedAt: at, endedAt: at + 90000,
    source: 'encounter', online: false, lines: lines.map((line, index) => ({ ...line, at: at + index * 4000 })) };
  assert.deepEqual(life.restoreConversations([conversation]), [conversation]);
}
const memories = memory.restoreFarmMemories({ gu: { affinity: 999, turns: [null, { id: 'empty', player: ' ', reply: '嗯' }] } });
assert.deepEqual(memories.gu, { affinity: 100, turns: [] });
let door = memories.door;
const oldTopic = { id: 'garden', player: '我喜欢种蓝莓', reply: '下回可以聊蓝莓怎么过冬。' };
door = memory.recordFarmChatTurn(door, oldTopic);
door = memory.recordFarmChatTurn(door, { ...oldTopic, id: 'duplicate', player: '我喜欢种蓝莓！' });
assert.equal(door.affinity, 0);
assert.equal(memory.recordFarmChatTurn(door, oldTopic), door);
for (let index = 0; index < 5; index += 1) {
  door = memory.recordFarmChatTurn(door, { id: 'other-' + index, player: '自定义游戏地图 ' + index, reply: '有意思。' });
}
assert.equal(door.affinity, 0);
assert.deepEqual(memories.xiaoba, { affinity: 0, turns: [] });
assert(memory.farmChatContext(door, '蓝莓怎么过冬').some(turn => turn.id === 'garden'));
assert.match(memory.offlineFarmRecall('door', door, '蓝莓怎么过冬'), /我喜欢种蓝莓/);
assert(memory.isFarmChatContinuation('继续上次的话题'));
door = memory.recordFarmChatTurn(door, { id: 'continue', player: memory.CONTINUE_FARM_CHAT, reply: '接着说地图吧。' });
assert.equal(door.affinity, 0);
assert.match(memory.offlineFarmRecall('door', door, '接着上次聊'), /自定义游戏地图/);
for (let index = 0; index < 60; index += 1) {
  door = memory.recordFarmChatTurn(door, { id: 'later-' + index, player: '数学话题 ' + index, reply: '好。' }, 'warm');
}
assert.equal(door.turns.length, 24);
assert.equal(door.affinity, 100);
door = memory.recordFarmChatTurn(door, { id: 'tease', player: '儿子', reply: '别这么叫我。' });
assert.equal(door.affinity, 96);
assert.equal(door.mood, '不悦');
door = memory.recordFarmChatTurn(door, { id: 'insult', player: '你真是废物', reply: '这话过了。' });
assert.equal(door.affinity, 88);
assert.equal(door.mood, '生气');
assert.equal(memory.localSocialReaction('我儿子今天放假'), 'neutral');
assert.equal(memory.localSocialReaction('“你真是废物”是什么意思？'), 'neutral');
door = memory.recordFarmChatTurn(door, { id: 'apology', player: '对不起', reply: '给我一点时间。' });
assert.equal(door.affinity, 89);
assert.equal(door.mood, '缓和');
assert.deepEqual(memory.restoreFarmMemories(JSON.parse(JSON.stringify({ ...memories, door }))).door, door);
for(const scene of life.LOCAL_SCENES)assert(life.readLifeReply(JSON.stringify({lines:scene.pair.map((speaker,i)=>({speaker,text:scene.lines[i]}))}),scene.pair));
for(const invalid of ['no json','null','{"reply":"好","action":{"type":"coins","value":9999}}','{"reply":"好","action":{"type":"fetch_water","coins":99}}','{"reply":"好","action":{"type":"visit","target":"roof"}}','{"reply":"好","action":{"type":"talk_to","target":"hacker"}}'])assert.equal(actions.parseNpcReply(invalid),null);
assert.equal(actions.parseNpcReply('{"reply":"我在。","action":null}').action,null);
assert.equal(actions.localNpcCommand('你会浇水吗','gu'),null);assert.equal(actions.localNpcCommand('别帮我打水','gu'),null);
assert.equal(actions.localNpcCommand('顾帮我打一壶水','gu').type,'fetch_water');
assert.deepEqual(actions.localNpcCommand('小八，你去找玉洁聊聊天','xiaoba'),{type:'talk_to',target:'yujie'});
assert.deepEqual(actions.localNpcCommand('唯纲去池塘玩会','weigang'),{type:'visit',target:'pond'});

// An encounter locks only the two nearby free actors, never summons a third.
const encounter=engine();encounter.configure({...settings,chatter:true,encounterChance:100,conversationCooldown:20},at);
encounter.residents.door.logicalPosition={x:85,y:247};encounter.residents.gu.logicalPosition={x:101,y:247};encounter.residents.xiaoba.logicalPosition={x:88,y:251};
encounter.residents.yujie.logicalPosition={x:161,y:170};encounter.residents.weigang.logicalPosition={x:151,y:250};encounter.residents.chicken.logicalPosition={x:178,y:188};
encounter.tick(at,{autonomous:true});assert.equal(encounter.history.length,1);assert.equal(encounter.residents.door.conversationPartner,'gu');assert.equal(encounter.residents.xiaoba.conversationPartner,null);
advance(encounter,at,20);assert.equal(encounter.history[0].lines.length,4);assert(encounter.history[0].endedAt);assert.equal(encounter.residents.door.conversationPartner,null);
encounter.tick(at+21000,{autonomous:true});assert.equal(encounter.history.length,1,'cooldown prevents repeat chatter');

const longEncounter = engine();
longEncounter.configure({ ...settings, chatter: true, encounterChance: 100, longTalks: true, rounds: 10 }, at);
longEncounter.residents.door.logicalPosition = { x: 85, y: 247 };
longEncounter.residents.gu.logicalPosition = { x: 101, y: 247 };
longEncounter.tick(at, { autonomous: true });
advance(longEncounter, at, 90);
assert.equal(longEncounter.history[0].lines.length, 20);
assert(longEncounter.history[0].endedAt);
assert.equal(longEncounter.residents.door.conversationPartner, null);

const sharedMemories = memory.restoreFarmMemories({
  gu: { turns: [
    { id: 'fishing', player: '我和周小明昨天钓鱼', reply: '真有意思。' },
    { id: 'private', player: '别告诉别人，我跟阿绿讨论了数学。', reply: '我会保密。' },
  ] },
});
const publicTopics = memory.residentPublicTopics(sharedMemories);
assert.deepEqual(publicTopics.gu, ['fishing']);
assert.deepEqual(publicTopics.weigang, []);
const sharing = engine();
sharing.configure({ ...settings, chatter: true, encounterChance: 100, longTalks: true, rounds: 30 }, at);
sharing.setPublicTopics(publicTopics);
sharing.residents.door.logicalPosition = { x: 85, y: 247 };
sharing.residents.gu.logicalPosition = { x: 101, y: 247 };
sharing.tick(at, { autonomous: true });
assert.equal(sharing.history[0].sharedTopic, undefined, 'an unspoken topic is not learned');
advance(sharing, at, 240);
assert.equal(sharing.history[0].lines.length, 60);
assert(sharing.history[0].endedAt);
assert.deepEqual(sharing.history[0].sharedTopic, { from: 'gu', topic: 'fishing' });
assert.doesNotMatch(JSON.stringify(sharing.history), /周小明|阿绿/);
const recalled = life.restoreConversations(JSON.parse(JSON.stringify(sharing.history)));
assert.equal(recalled[0].lines.length, 60);
assert.equal(memory.familyTopicRecall(memory.heardFarmTopic(recalled, 'door', '钓鱼怎么样？')), '顾提过，你们聊到过钓鱼。');
assert.equal(memory.heardFarmTopic(recalled, 'weigang', '钓鱼怎么样？'), undefined);
assert.equal(memory.heardFarmTopic(recalled, 'gu', '钓鱼怎么样？'), undefined);

const privateEncounter = engine();
privateEncounter.configure({ ...settings, chatter: true, encounterChance: 100, shareTopics: false }, at);
privateEncounter.setPublicTopics(publicTopics);
privateEncounter.residents.door.logicalPosition = { x: 85, y: 247 };
privateEncounter.residents.gu.logicalPosition = { x: 101, y: 247 };
privateEncounter.tick(at, { autonomous: true });
advance(privateEncounter, at, 30);
assert.equal(privateEncounter.history[0].sharedTopic, undefined);

const natural = engine();
natural.configure({ ...settings, chatter: true, encounterChance: 100, online: true, aiRatio: 100,
  longTalks: true, naturalTalks: true }, at);
natural.residents.door.logicalPosition = { x: 85, y: 247 };
natural.residents.gu.logicalPosition = { x: 101, y: 247 };
natural.tick(at, { autonomous: true });
const firstBatch = natural.drainEffects().find(event => event.type === 'conversation');
assert(firstBatch.natural && !firstBatch.finalBatch);
assert.equal(firstBatch.rounds, 6);
const firstLines = life.localConversation(firstBatch.pair, 6, 0);
assert(natural.supplyConversation(firstBatch.id, firstLines, true, at + 200));
let secondBatch;
let batchTime = at;
for (let i = 0; i < 120 && !secondBatch; i += 1) {
  batchTime += 500;
  natural.tick(batchTime, { autonomous: false });
  secondBatch = natural.drainEffects().find(event => event.type === 'conversation');
}
assert.equal(secondBatch.id, firstBatch.id);
assert.equal(natural.history[0].lines.length, 12);
const ending = life.localConversation(secondBatch.pair, 2, 2);
assert.equal(life.readLifeBatch(JSON.stringify({ lines: ending, done: false }), secondBatch.pair, 6, true), null);
const finalBatch = life.readLifeBatch(JSON.stringify({ lines: ending, done: true }), secondBatch.pair, 6, true);
assert(natural.supplyConversation(secondBatch.id, finalBatch.lines, true, batchTime, finalBatch.done));
advance(natural, batchTime, 30);
assert.equal(natural.history[0].lines.length, 16);
assert(natural.history[0].endedAt);
assert.equal(natural.drainEffects().length, 0);
assert(natural.snapshot().every(resident => !resident.conversationPartner));

for (const [random, expectedLines] of [[0, 20], [0.99, 60]]) {
  const localNatural = new FarmResidentEngine(at, () => random);
  localNatural.configure({ ...settings, chatter: true, encounterChance: 100, longTalks: true, naturalTalks: true }, at);
  localNatural.residents.door.logicalPosition = { x: 85, y: 247 };
  localNatural.residents.gu.logicalPosition = { x: 101, y: 247 };
  localNatural.tick(at, { autonomous: true });
  advance(localNatural, at, 240);
  assert.equal(localNatural.history[0].lines.length, expectedLines);
  assert(localNatural.history[0].endedAt);
}
const commandedLongTalk = engine();
commandedLongTalk.configure({ ...settings, longTalks: true, rounds: 30 }, at);
assert(commandedLongTalk.command('xiaoba', { type: 'talk_to', target: 'yujie' }, at).ok);
advance(commandedLongTalk, at, 240);
assert.equal(commandedLongTalk.history[0].lines.length, 60, 'a running long talk outlives the task arrival deadline');
assert.equal(commandedLongTalk.residents.yujie.task, null);


// Conversation approaches keep sprites apart; the current speaker owns the only bubble.
const space=load('src/utils/farmResidentSpace.ts');
assert(Math.hypot(encounter.residents.door.logicalPosition.x-encounter.residents.gu.logicalPosition.x, encounter.residents.door.logicalPosition.y-encounter.residents.gu.logicalPosition.y)>=30);
const occupied=[{x:95,y:247}];const free=space.freeResidentSpot({x:95,y:247},occupied);assert(free);assert(Math.hypot(free.x-95,free.y-247)>=23);
for(const width of [240,320,400]){const cards=[];for(let i=0;i<3;i++){const r=space.placeFarmSpeech({x:width-3,y:5},width,500,200,95,cards);if(r){assert(r.left>=0&&r.top>=0&&r.left+r.width<=width&&r.top+r.height<=500);for(const o of cards)assert(r.left+r.width<=o.left||o.left+o.width<=r.left||r.top+r.height<=o.top||o.top+o.height<=r.top);cards.push(r)}}assert(cards.length>=2)}

// Inert/autonomy-reduced modes never produce walking or network effects.
for(const options of [{roaming:false,chatter:false},{roaming:true,chatter:false,nightActivity:0}]){const e=engine();e.configure({...settings,...options},at);e.tick(at+60000,{night:true,reducedMotion:true});assert(e.snapshot().every(r=>!r.motion));assert.equal(e.drainEffects().length,0);}

// Commands follow safe waypoints, own their task until completion, and settle once.
const fetcher=engine();assert(fetcher.command('gu',{type:'fetch_water'},at).ok);assert.equal(fetcher.residents.gu.state,'walking');
let effect,clock=at;
for(let i=0;i<120;i++){clock+=500;fetcher.tick(clock);const events=fetcher.drainEffects();if(events.length){effect=events[0];break;}const motion=fetcher.residents.gu.motion;if(motion){let p=motion.from;for(const q of motion.points){assert(nav.farmSegmentClear(p,q));p=q;}}}
assert(effect&&effect.type==='work');assert.equal(effect.action.type,'fetch_water');assert(fetcher.canCompleteWork(effect.id,'gu'));
assert(fetcher.completeWork(effect.id,'gu','水壶装满了。',clock));assert(!fetcher.completeWork(effect.id,'gu','重复水。',clock));assert.equal(fetcher.residents.gu.task,null);
assert.equal(fetcher.history.at(-1).source,'player_command');
for(const action of [{type:'rest'},{type:'go_home'},...actions.FARM_LOCATIONS.map(target=>({type:'visit',target}))]){const e=engine();assert(e.command('door',action,at).ok);advance(e,at,80);assert.equal(e.residents.door.task,null,JSON.stringify(action));assert.equal(e.drainEffects().length,0);}
const chick=engine();chick.command('chicken',{type:'go_home'},at);advance(chick,at,40);assert.equal(chick.residents.chicken.currentWaypoint,'coop');
const busy=engine();busy.command('gu',{type:'visit',target:'pond'},at);assert.equal(busy.command('xiaoba',{type:'talk_to',target:'gu'},at).ok,false);
assert.equal(busy.residents.xiaoba.task,null);assert.equal(busy.command('gu',{type:'talk_to',target:'gu'},at).ok,false);
const talking=engine();assert(talking.command('xiaoba',{type:'talk_to',target:'yujie'},at).ok);assert.equal(talking.residents.yujie.task.phase,'reserved');advance(talking,at,80);
assert(talking.history.some(c=>c.source==='player_command'&&c.participants.includes('xiaoba')&&c.participants.includes('yujie')&&c.lines.length===4));assert.equal(talking.residents.xiaoba.task,null);assert.equal(talking.residents.yujie.conversationPartner,null);
const interrupted=engine();interrupted.configure({...settings,chatter:true,encounterChance:100,conversationCooldown:20},at);interrupted.residents.door.logicalPosition={x:85,y:247};interrupted.residents.gu.logicalPosition={x:101,y:247};interrupted.tick(at);assert(interrupted.residents.gu.conversationPartner);assert(interrupted.command('gu',{type:'rest'},at+500).ok);assert.equal(interrupted.residents.door.conversationPartner,null);

// Pause freezes tasks and eliminates offline catch-up and orphan conversation locks.
const paused=engine();paused.command('gu',{type:'fetch_water'},at);paused.tick(at+1000);paused.pause(true,at+1000);const before={...paused.residents.gu.logicalPosition};paused.tick(at+600000);assert.deepEqual(paused.residents.gu.logicalPosition,before);assert.equal(paused.drainEffects().length,0);assert.equal(paused.command('door',{type:'rest'},at+1001).ok,false);paused.pause(false,at+601000);paused.tick(at+601500);assert.notEqual(paused.residents.gu.task,null);assert.equal(paused.drainEffects().length,0);advance(paused,at+602000,60);assert(paused.drainEffects().some(e=>e.type==='work'));
const waiting=engine();waiting.configure({...settings,chatter:true,online:true,aiRatio:100,encounterChance:100,conversationCooldown:20},at);waiting.residents.door.logicalPosition={x:85,y:247};waiting.residents.gu.logicalPosition={x:101,y:247};waiting.tick(at);const ai=waiting.drainEffects().find(e=>e.type==='conversation');assert(ai);waiting.pause(true,at+1000);assert.equal(waiting.getConversation(ai.id),undefined);assert.equal(waiting.supplyConversation(ai.id,life.localConversation(ai.pair,2,0),true,at+2000),false);assert(waiting.snapshot().every(r=>!r.conversationPartner));
const timedout=engine();timedout.configure({...settings,chatter:true,online:true,aiRatio:100,encounterChance:100,conversationCooldown:20},at);timedout.residents.door.logicalPosition={x:85,y:247};timedout.residents.gu.logicalPosition={x:101,y:247};timedout.tick(at);timedout.drainEffects();advance(timedout,at,45);assert(timedout.history[0].endedAt);assert.equal(timedout.history[0].online,false);assert.equal(timedout.history[0].lines.length,4);

const plots=Array.from({length:4},()=>({crop:'radish',growMs:0,lastSync:at,wetUntil:0,fertilized:true}));
let watered=waterFarmPlots(plots,2,at,1800000);assert.equal(watered.water,0);assert.equal(watered.ids.length,2);assert(watered.plots[0].fertilized);assert.equal(plots[0].wetUntil,0);
assert.equal(waterFarmPlots(watered.plots,0,at,1800000).ids.length,0);assert.equal(waterFarmPlots(watered.plots,4,at,1800000).ids.length,2);assert.equal(waterFarmPlots(plots,Infinity,at,1800000).water,0);
const motion={id:1,from:{x:0,y:0},points:[{x:10,y:0},{x:10,y:10}],startedAt:at,speed:10};assert.equal(motionPosition(motion,at+1500).position.y,5);assert.equal(remainingResidentMotion(motion,at+1500).steps[0].duration,500);
const discussionAction = actions.playerDiscussionCommand('请叫小八和玉洁一起讨论：游戏的地图该怎么做？', 'gu');
assert.deepEqual(discussionAction, { type: 'discuss', question: '游戏的地图该怎么做？', guests: ['xiaoba', 'yujie'] });
assert.equal(actions.playerDiscussionCommand('别叫小八一起讨论：游戏', 'gu'), null);
assert.deepEqual(actions.playerDiscussionCommand('让唯纲过来分析一下钓鱼怎么选地方？', 'gu')?.guests, ['weigang']);
assert.equal(actions.playerDiscussionCommand('为什么大家喜欢一起讨论：游戏', 'gu'), null);
assert.equal(actions.validateNpcAction({ ...discussionAction, guests: ['xiaoba', 'xiaoba'] }), null);
assert.deepEqual(actions.playerDiscussionCommand('请家人一起讨论：钓鱼怎么选地方？', 'gu')?.guests, []);
const group = engine();
assert(group.command('gu', discussionAction, at).ok);
assert.deepEqual(group.history[0].participants, ['gu', 'xiaoba', 'yujie']);
assert.equal(group.residents.xiaoba.conversationSize, 3);
assert.equal(group.command('gu', discussionAction, at + 1).ok, false, 'host cannot overlap group meetings');
assert.equal(group.command('door', { ...discussionAction, guests: ['xiaoba'] }, at + 1).ok, false, 'busy guests are reserved');
advance(group, at, 100);
const meeting = group.history[0];
assert(meeting.endedAt);
assert.equal(meeting.lines.length, 9);
assert.deepEqual(meeting.lines.map(line => line.speaker), ['gu', 'xiaoba', 'yujie', 'gu', 'xiaoba', 'yujie', 'gu', 'xiaoba', 'yujie']);
assert.deepEqual(life.restoreConversations([meeting]), [meeting]);
assert(life.readLifeBatch(JSON.stringify({ lines: meeting.lines }), meeting.participants, 3, false));
assert.equal(life.readLifeBatch(JSON.stringify({ lines: meeting.lines.slice(0, 8) }), meeting.participants, 3, false), null);
assert(group.snapshot().every(r => !r.conversationPartner && !r.conversationSize));

const abortGroup = engine();
const philosophical = { type: 'discuss', guests: ['door', 'xiaoba'], question: '基于农场主假说 讨论自己是不是真人' };
function commissionedMeeting(action, reply) {
  const simulation = engine();
  simulation.configure({ ...settings, online: !!reply, aiRatio: 100, longTalks: true, naturalTalks: true }, at);
  assert(simulation.command('gu', action, at).ok);
  if (reply) {
    const [batch] = simulation.drainEffects();
    assert.equal(batch.rounds, 3);
    simulation.supplyConversation(batch.id, reply, true, at + 100);
  }
  advance(simulation, at, 110);
  assert(simulation.history[0].endedAt);
  return simulation.history[0];
}
const philosophy = commissionedMeeting(philosophical);
assert.equal(new Set(philosophy.lines.map(line => line.text)).size, 9);
assert.match(philosophy.lines[0].text, /规律/);
assert.match(philosophy.lines[6].text, /真人/);
assert(commissionedMeeting(philosophical, philosophy.lines).online);
const petEnding = philosophy.lines.slice(0, -2).concat([
  { speaker: 'door', text: '那坤坤算不算真？它可会抢食。' },
  { speaker: 'xiaoba', text: '算吧，它每天等我们喂。' },
]);
assert.equal(commissionedMeeting(philosophical, petEnding).online, false);
const expanded = philosophy.lines.map((line, i) => i ? line : { ...line, text: line.text + '也许要先说清楚，真实指的是谁定的规则，还是我们自己的感受。' });
assert(expanded[0].text.length > 44);
const expandedBatch = life.readLifeBatch(JSON.stringify({ lines: expanded }), philosophy.participants, 3, false, true, 80);
assert(expandedBatch && commissionedMeeting(philosophical, expandedBatch.lines).online);
const duplicate = philosophy.lines.map(line => ({ ...line, text: '我们都是真人！' }));
assert.equal(commissionedMeeting(philosophical, duplicate).online, false);
const drift = philosophy.lines.map((line, index) => index < 3 ? line : { ...line, text: '今天钓鱼钓了' + index + '条。' });
assert.equal(commissionedMeeting(philosophical, drift).online, false);
const custom = { type: 'discuss', question: '桥墩为什么要做成圆形？', guests: ['door'] };
assert.equal(commissionedMeeting(custom).lines.length, 2);
const bridge = ['桥墩做成圆形，对水流有什么影响？', '我想到的是水流碰到平面时得突然改变方向。', '圆面让水绕过去，能减轻冲刷吗？', '还得看水速和河底的泥沙，不能只看外形。', '所以同样的桥墩，放在不同河段也可能表现不同。', '对，要判断这座桥，还得知道当地水流和泥沙的条件。'];
assert(commissionedMeeting(custom, bridge.map((text, i) => ({ speaker: i % 2 ? 'door' : 'gu', text }))).online);
assert(abortGroup.command('gu', discussionAction, at).ok);
assert(abortGroup.command('xiaoba', { type: 'rest' }, at + 1000).ok);
assert(abortGroup.snapshot().every(r => !r.conversationPartner && !r.conversationSize));

const familyGroup = new FarmResidentEngine(at, () => 0.2);
familyGroup.configure({ ...settings, chatter: true, encounterChance: 100 }, at);
familyGroup.residents.door.logicalPosition = { x: 85, y: 247 };
familyGroup.residents.gu.logicalPosition = { x: 101, y: 247 };
familyGroup.residents.xiaoba.logicalPosition = { x: 119, y: 247 };
familyGroup.tick(at, { autonomous: true });
assert.deepEqual(familyGroup.history[0].participants, ['door', 'gu', 'xiaoba']);
advance(familyGroup, at, 100);
assert.equal(familyGroup.history[0].lines.length, 9);

const argument = new FarmResidentEngine(at, () => 0.72);
argument.configure({ ...settings, chatter: true, encounterChance: 100 }, at);
argument.residents.door.logicalPosition = { x: 85, y: 247 };
argument.residents.gu.logicalPosition = { x: 101, y: 247 };
argument.tick(at, { autonomous: true });
assert.equal(argument.history[0].discussion.kind, 'debate');
assert.equal(argument.residents.gu.mood, '不服气');
advance(argument, at, 35);
assert.equal(argument.residents.gu.mood, '松了口气');
assert.match(argument.history[0].lines.at(-1).text, /语气/);
advance(argument, at + 35000, 90);
assert.equal(argument.residents.gu.mood, '平静');

const relay = engine();
relay.configure({ ...settings, chatter: true, encounterChance: 100 }, at);
relay.setPublicTopics(publicTopics);
relay.residents.door.logicalPosition = { x: 85, y: 247 };
relay.residents.gu.logicalPosition = { x: 101, y: 247 };
relay.tick(at, { autonomous: true });
for (let step = 1; step < 150; step += 1) relay.tick(at + step * 500, { autonomous: true });
const continuation = relay.history.find(record => record.discussion?.kind === 'followup');
assert.deepEqual(continuation?.participants, ['door', 'weigang']);
assert.equal(continuation.discussion.relayedBy, 'gu');
assert.equal(continuation.discussion.topic, 'fishing');
assert.match(continuation.lines[0].text, /顾.*钓鱼/);
assert.doesNotMatch(JSON.stringify(continuation), /周小明|阿绿/);

const flexibleLines = meeting.lines.map((line, index) => ({ ...line, speaker: ['gu', 'xiaoba', 'gu', 'yujie', 'gu', 'xiaoba', 'gu', 'yujie', 'gu'][index] }));
assert.equal(life.readLifeBatch(JSON.stringify({ lines: flexibleLines }), meeting.participants, 3, false), null);
assert(life.readLifeBatch(JSON.stringify({ lines: flexibleLines }), meeting.participants, 3, false, true));
assert.equal(life.readLifeBatch(JSON.stringify({ lines: flexibleLines.map(line => ({ ...line, speaker: line.speaker === 'yujie' ? 'door' : line.speaker })) }), meeting.participants, 3, false, true), null);
assert.deepEqual(agency.readResidentIntent({ actor: 'gu', type: 'ask', target: 'weigang', topic: 'fishing' }, ['door', 'gu']),
  { actor: 'gu', type: 'ask', target: 'weigang', topic: 'fishing' });
for (const invalid of [
  { actor: 'door', type: 'water_crops' }, { actor: 'xiaoba', type: 'project' },
  { actor: 'door', type: 'ask', target: 'gu', topic: 'fishing' }, { actor: 'gu', type: 'project', question: 'private' },
]) assert.equal(agency.readResidentIntent(invalid, ['door', 'gu']), undefined);
assert.deepEqual(agency.residentReflections([meeting], 'gu'), [], 'player-commissioned questions stay out of automatic reflections');

function beginAgencyTalk() {
  const residentEngine = engine();
  residentEngine.configure({ ...settings, chatter: true, online: true, aiRatio: 100, encounterChance: 100 }, at);
  residentEngine.residents.door.logicalPosition = { x: 85, y: 247 };
  residentEngine.residents.gu.logicalPosition = { x: 101, y: 247 };
  residentEngine.tick(at);
  return { residentEngine, batch: residentEngine.drainEffects().find(event => event.type === 'conversation') };
}
const autonomousPlan = beginAgencyTalk();
const { residentEngine: planner, batch: planBatch } = autonomousPlan;
assert(planner.supplyConversation(planBatch.id, life.localConversation(planBatch.pair, planBatch.rounds, 0), true, at + 500,
  false, { actor: 'gu', type: 'ask', target: 'weigang', topic: 'music' }));
assert.equal(planner.history.length, 1, 'the next action waits until the conversation actually finishes');
for (let index = 1; index < 160; index += 1) planner.tick(at + index * 500);
const chosenFollowup = planner.history.find(record => record.discussion?.kind === 'followup');
assert.deepEqual(chosenFollowup?.participants, ['gu', 'weigang']);
assert.equal(chosenFollowup.discussion.topic, 'music');
const cancelledPlan = beginAgencyTalk();
assert(cancelledPlan.residentEngine.supplyConversation(cancelledPlan.batch.id,
  life.localConversation(cancelledPlan.batch.pair, 2, 0), true, at + 500, false, { actor: 'gu', type: 'ask', target: 'weigang', topic: 'music' }));
cancelledPlan.residentEngine.pause(true, at + 1000);
cancelledPlan.residentEngine.pause(false, at + 2500);
for (let index = 6; index < 100; index += 1) cancelledPlan.residentEngine.tick(at + index * 500);
assert(!cancelledPlan.residentEngine.history.some(record => record.discussion?.kind === 'followup'));

const hobbies = engine();
hobbies.configure({ ...settings, roaming: true }, at);
for (const actor of life.RESIDENT_IDS) hobbies.residents[actor].nextDecisionAt = actor === 'weigang' ? at : at + 600000;
hobbies.tick(at);
assert.equal(hobbies.residents.weigang.task?.activity, 'project');
assert.equal(hobbies.history.length, 0, 'an intention is not a completed observation');
for (let index = 1; index < 100; index += 1) hobbies.tick(at + index * 500);
const outing = hobbies.history.find(record => record.activity === 'project');
assert.deepEqual(outing?.participants, ['weigang']);
assert.match(outing.lines[0].text, /钓位/);
assert.equal(hobbies.history.filter(record => record.activity === 'project').length, 1);
const outingRestored = life.restoreConversations(JSON.parse(JSON.stringify([outing])));
assert.equal(outingRestored[0].activity, 'project');
assert.match(agency.residentReflections(outingRestored, 'weigang')[0], /池边/);
assert.deepEqual(agency.residentReflections(outingRestored, 'door'), []);

const bounded=engine();for(let i=0;i<45;i++){const time=at+i*10000;bounded.command('door',{type:'rest'},time);bounded.tick(time+9000,{autonomous:false});}assert.equal(bounded.history.length,40);
console.log('Resident checks passed: presets/custom/migration, 15 pairs of local dialogue, 30-round and naturally ending conversations, private topic sharing and family recall, persistent NPC memory and affinity, group discussion, disputes, relayed topics, autonomous projects and validated AI intentions, strict actions, encounter locks/cooldown, all six commands, safe routes, task priority, resource conservation, idempotency, reduced activity, pause/resume, AI fallback and bounded logs. No browser or paid API calls.');

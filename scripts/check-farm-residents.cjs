const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(relative){const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename).exports;const m=new Module(filename,module);cache.set(filename,m);m.require=name=>name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))):require(name);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return m.exports;}
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
for(const [key,[min,max]] of Object.entries(life.SETTING_RANGES)){assert.equal(life.normalizeLifeSettings({[key]:-1})[key],min);assert.equal(life.normalizeLifeSettings({[key]:999999})[key],max);assert(Number.isFinite(life.normalizeLifeSettings({[key]:Infinity})[key]));}
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
const bounded=engine();for(let i=0;i<45;i++){const time=at+i*10000;bounded.command('door',{type:'rest'},time);bounded.tick(time+9000,{autonomous:false});}assert.equal(bounded.history.length,40);
console.log('Resident checks passed: presets/custom/migration, 15 pairs of local dialogue, strict actions, encounter locks/cooldown, all six commands, safe routes, task priority, resource conservation, idempotency, reduced activity, pause/resume, AI fallback and bounded logs. No browser or paid API calls.');

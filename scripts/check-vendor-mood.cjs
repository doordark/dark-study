const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(relative){const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename).exports;const m=new Module(filename,module);cache.set(filename,m);m.require=name=>name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))):require(name);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return m.exports;}
const memory=load('src/utils/farmMemory.ts');
const {vendorCanTrade,vendorQuotedPrice,restoreGear}=load('src/utils/farmMarket.ts');
let state={ affinity: 30, turns: [] }, id=0;
const say=text => state=memory.recordFarmChatTurn(state,{id:String(++id),player:text,reply:'reply'});
assert(vendorCanTrade(state));
say('儿子');
assert.equal(state.mood,'不悦'); assert(vendorCanTrade(state));
const score=state.affinity;
say('你好'); assert(vendorCanTrade(state));
say('谢谢你'); assert.equal(state.affinity,score); assert(vendorCanTrade(state));
say('滚'); assert.equal(state.mood,'生气'); assert(!vendorCanTrade(state));
const angryScore=state.affinity;
say('他说滚是什么意思'); assert.equal(state.affinity,angryScore); assert(!vendorCanTrade(state));
state=memory.restoreFarmMemories({door:state}).door; assert(!vendorCanTrade(state),'reopening keeps the refusal');
say('刚才是我不对，对不起'); assert.equal(state.mood,'缓和'); assert(vendorCanTrade(state));
assert(vendorCanTrade({mood:'不悦',affinity:100}));
console.log('Vendor mood: displeased trading, angry refusal, persistence and apology recovery passed.');

const {coopComfort,chickenCanHelp}=load('src/utils/farmCoop.ts');
const {PERSONALITIES}=load('src/utils/farmPersonality.ts');
const at=new Date(2026,10,6,12).getTime();
for(const vendor of ['smith','farmer','chemist','traveler']) {
 const base=vendorQuotedPrice(vendor,100,{affinity:0},at);
 assert(vendorQuotedPrice(vendor,100,{affinity:100,mood:'不悦'},at)>base);
 assert(vendorQuotedPrice(vendor,100,{affinity:100,mood:'开心'},at)<base);
 assert(vendorQuotedPrice(vendor,100,{affinity:100,mood:'开心'},at)<=vendorQuotedPrice(vendor,100,{affinity:30,mood:'开心'},at));
 assert(!vendorCanTrade({mood:'生气'}));
}
const empty=restoreGear();assert.equal(coopComfort(empty.coop),0);
assert.equal(coopComfort({bedding:true,perch:true,feeder:true}),100);
assert.deepEqual(restoreGear({...empty,coop:{bedding:true}}).coop,{bedding:true,perch:false,feeder:false});
let low=0,high=0;
for(let i=0;i<1000;i++){const time=at+i*60000;low+=chickenCanHelp(20,time,0,false);high+=chickenCanHelp(100,time,0,false);assert(!chickenCanHelp(0,time,0,false));assert(!chickenCanHelp(100,time,0,true));assert(!chickenCanHelp(100,time,time-60000,false));}
assert(high>low && high<180 && low>0,'comfort controls rare assistance, not every-tick rewards');
const thanks='谢谢你今天的帮忙';
const initial={affinity:30,turns:[]};
const smith=memory.recordFarmChatTurn(initial,{id:'p1',player:thanks,reply:'ok'},'warm','smith');
const traveler=memory.recordFarmChatTurn(initial,{id:'p1',player:thanks,reply:'ok'},'warm','traveler');
assert.equal(smith.affinity,31);assert.equal(traveler.affinity,33);
assert.equal(Object.keys(PERSONALITIES).length,10);
console.log('Dynamic markups/discounts, personality-specific affinity, coop migration and chicken probability/cooldown checks passed.');

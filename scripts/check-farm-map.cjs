const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname,'..');
function load(relative, dependencies={}) {
  const filename=path.join(root,relative),m=new Module(filename,module);
  m.require=name=>dependencies[name]??require(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
  return m.exports;
}
const map=load('src/constants/farmMap.ts');
const nav=load('src/utils/farmNavigation.ts',{'@/constants/farmMap':map});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
assert.equal(map.PLOTS.length,16);
for(const [i,p] of map.PLOTS.entries()) {
  assert(p.x>=0&&p.y>=0&&p.x+p.w<=200&&p.y+p.h<=330);
  for(const q of map.PLOTS.slice(i+1)) assert(p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y,'plots must not overlap');
  assert(dist(map.plotApproach(i),nav.safeFarmPoint(map.plotApproach(i)))<0.01,'plot interaction approach is walkable');
}
for(const [id,p] of Object.entries(map.WAYPOINTS)) {
  assert(dist(p,nav.safeFarmPoint(p))<0.01,`${id} must stand outside blockers`);
  for(const next of p.neighbors) {
    assert(map.WAYPOINTS[next],`${id}: missing neighbor ${next}`);
    assert(map.WAYPOINTS[next].neighbors.includes(id),`${id} -> ${next} must be bidirectional`);
    assert(nav.farmSegmentClear(p,map.WAYPOINTS[next]),`${id} -> ${next} crosses a blocker`);
  }
}
const reached=new Set();const queue=['houseDoor'];
while(queue.length){const id=queue.shift();if(reached.has(id))continue;reached.add(id);queue.push(...map.WAYPOINTS[id].neighbors);}
assert.equal(reached.size,Object.keys(map.WAYPOINTS).length,'waypoint graph is connected');
const targets=[...Object.values(map.WAYPOINTS),map.HOUSE.door,map.POND.approach,map.MARKET.approach,map.COOP.approach,...map.PLOTS.map((_,i)=>map.plotApproach(i))];
for(const p of Object.values(map.RESIDENT_PLACEMENTS)) targets.push(p.home);
for(const blocker of map.BLOCKERS)targets.push({x:blocker.x+blocker.w/2,y:blocker.y+blocker.h/2});
let segments=0;const started=performance.now();
for(const from of [map.PLAYER_START,...Object.values(map.RESIDENT_PLACEMENTS).map(p=>p.home),map.WAYPOINTS.pondSouth])for(const to of targets){
  let previous=nav.safeFarmPoint(from);const destination=nav.safeFarmPoint(to);const route=nav.planFarmRoute(from,to);
  assert(route.length||dist(previous,destination)<0.1,`no route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  for(const step of route){assert(nav.farmSegmentClear(previous,step),'movement segments cannot cut through walls, soil, water, trees or furniture');previous=step;segments++;}
  assert(dist(previous,destination)<0.1);
}
const read=name=>PNG.sync.read(fs.readFileSync(path.join(root,'assets/images',name)));
const room=read('farm-house-interior-v2.png'),roomNight=read('farm-house-interior-night-v2.png');
assert.equal(room.width/room.height,map.HOUSE_ROOM.width/map.HOUSE_ROOM.height);assert.equal(room.width,roomNight.width);assert.equal(room.height,roomNight.height);
for(const width of [320,360,393,412,600]){const scale=Math.min(width,520)/200;for(const p of map.PLOTS)assert(p.x*scale+p.w*scale<=Math.min(width,520)+0.1);}
console.log(`Farm map checks passed: 16 plots; connected, collision-free waypoint edges; ${segments} safe route segments; house interior aspect matches; 320/360/393/412/600 logical-pixel widths. Route matrix took ${Math.round(performance.now()-started)}ms including asset checks.`);

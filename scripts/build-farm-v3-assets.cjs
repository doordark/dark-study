/* Deterministic layer separation/redrawing, explicitly preferred by the V3 brief.
 * Uses original generated project art, never third-party stock or game assets.
 * Day/night share exactly the same alpha silhouettes and geometry. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/constants/farmMap.ts');
const mod = new Module(file, module);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,file);
const map = mod.exports;
const S = 3, W = map.SCENE_SIZE.width * S, H = map.SCENE_SIZE.height * S;
const out = path.join(root,'assets/images');
const read = p => PNG.sync.read(fs.readFileSync(path.join(root,p)));
const save = (p,img) => fs.writeFileSync(path.join(out,p), PNG.sync.write(img));
const blank = (w,h) => new PNG({ width: w, height: h, colorType: 6 });
const pixel = (img,x,y) => { const i = (Math.max(0,Math.min(img.height-1,Math.floor(y))) * img.width + Math.max(0,Math.min(img.width-1,Math.floor(x)))) * 4; return [...img.data.subarray(i,i+4)]; };
function put(img,x,y,c) { if(x<0||y<0||x>=img.width||y>=img.height)return; const i=(y*img.width+x)*4; for(let j=0;j<4;j++)img.data[i+j]=c[j]??255; }
function polygon(x,y,points) { let hit=false; for(let i=0,j=points.length-1;i<points.length;j=i++) { const a=points[i],b=points[j]; if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit; } return hit; }
const original = read('assets/farm-v3/scene-concept.png');
const source = blank(W,H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++)put(source,x,y,pixel(original,x/W*original.width,y/H*original.height));
const base = blank(W,H); source.data.copy(base.data);
// Hand-traced silhouettes in logical coordinates, solely for cutting the art.
const layers = [
 ['house',map.HOUSE,[[9,100],[18,77],[33,76],[33,63],[45,63],[45,74],[57,70],[68,73],[76,73],[85,101],[84,132],[76,135],[55,135],[55,137],[40,137],[40,134],[14,134],[14,104]]],
 ['coop',map.COOP,[[163,154],[173,143],[188,141],[197,151],[197,176],[190,178],[190,183],[165,183],[165,175]]],
 ['market',map.MARKET,[[7,187],[13,185],[13,181],[52,180],[58,187],[56,195],[56,207],[62,207],[62,219],[52,222],[10,220],[10,199],[7,199]]],
 ['pond',map.POND,[[119,280],[125,270],[131,268],[130,259],[133,256],[138,263],[152,258],[166,261],[181,255],[185,263],[193,269],[198,282],[194,296],[181,302],[138,303],[124,298]]],
 ['bench',map.BENCH,[[100,228],[104,221],[123,225],[124,235],[121,240],[101,235]]],
 ['tree',map.TREE,[[0,251],[5,243],[14,235],[27,231],[40,236],[50,244],[59,261],[55,278],[43,282],[44,296],[51,302],[33,305],[23,302],[14,306],[7,302],[10,290],[0,280]]],
];
// Reuse a clean grass patch from the concept for the unseen ground under facilities.
function grass(x,y) { return pixel(source,(157+(x%42)/S)*S,(206+(y%36)/S)*S); }
for(const [name,rect,outline] of layers) {
 const img=blank(Math.round(rect.w*S),Math.round(rect.h*S));
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++) {
  const sx=Math.round(rect.x*S)+x,sy=Math.round(rect.y*S)+y;
  if(polygon(sx/S,sy/S,outline)) { put(img,x,y,pixel(source,sx,sy)); put(base,sx,sy,grass(sx,sy)); }
 }
 save(`farm-${name}-v3.png`,img);
 save(`farm-${name}-night-v3.png`,night(img,name,rect));
}
// Calibrate all sixteen beds with a single reusable soil tile. The background no
// longer determines hit boxes: farmMap is the source of truth for generation too.
for(let y=135*S;y<202*S;y++)for(let x=84*S;x<155*S;x++)put(base,x,y,grass(x,y));
for(const p of map.PLOTS)for(let y=0;y<Math.round(p.h*S);y++)for(let x=0;x<Math.round(p.w*S);x++) {
 put(base,Math.round(p.x*S)+x,Math.round(p.y*S)+y,pixel(source,(86.3+x/(p.w*S)*15)*S,(137+y/(p.h*S)*14)*S));
}
function segmentDistance(x,y,a,b) {const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
for(const route of map.EXTRA_PATHS)for(let y=125*S;y<230*S;y++)for(let x=65*S;x<171*S;x++) {
 const d=Math.min(...route.points.slice(1).map((b,i)=>segmentDistance(x/S,y/S,route.points[i],b)));
 if(d<route.width/2) {
  const edge=d>route.width/2-.45;
  const color=edge?[188,151,94,255]:pixel(source,(46+(x%9)/S)*S,(142+(y%12)/S)*S);
  put(base,x,y,color);
 }
}
save('farm-day-v3.png',base); save('farm-night-v3.png',night(base,'terrain'));

function night(img,name,rect={x:0,y:0}) {
 const result=blank(img.width,img.height);
 const lamps=[{x:47,y:111},{x:13,y:193},{x:79,y:222},{x:123,y:122}];
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++) {
  const [r,g,b,a]=pixel(img,x,y);const gx=x/S+rect.x,gy=y/S+rect.y;
  let c=[r*.35+5,g*.43+5,b*.64+14,a];
  if(name==='terrain'&&gy<60) { c=[r*.18+3,g*.23+5,b*.4+16,a]; if(((x*37+y*71)%3527===0)&&gy<40)c=[201,218,240,a]; }
  // Identical window pixels, relit rather than re-generated at different positions.
  const window=name==='house'&&((gx>58&&gx<68&&gy>85&&gy<93)||(gx>62&&gx<73&&gy>112&&gy<122));
  if(window&&b>r*1.05&&b>g*.95)c=[245,188,91,a];
  for(const lamp of lamps)if(Math.hypot(gx-lamp.x,gy-lamp.y)<3&&r>150&&r>g*1.05&&g>b*1.3)c=[Math.max(215,r),Math.max(155,g),Math.max(60,b),a];
  put(result,x,y,c);
 }
 return result;
}
// Interior is one bitmap per lighting state. Bed overlay and game text stay native.
const roomPath=path.join(root,'assets/farm-v3/house-concept.png');
if(fs.existsSync(roomPath)) {
 const room=read('assets/farm-v3/house-concept.png'); const day=blank(720,540);
 for(let y=0;y<540;y++)for(let x=0;x<720;x++)put(day,x,y,pixel(room,x/720*room.width,y/540*room.height));
 const dark=blank(720,540);
 for(let y=0;y<540;y++)for(let x=0;x<720;x++) {
  const [r,g,b]=pixel(day,x,y);const nx=x/720,ny=y/540;
  let c=[r*.46+9,g*.43+8,b*.57+13,255];
  if(nx>.12&&nx<.34&&ny>.10&&ny<.37&&b>r*.95&&b>g*.85)c=[19+r*.08,30+g*.12,58+b*.14,255];
  // Warm desk-lamp light is a baked lighting pass, no extra animated view subtree.
  const glow=Math.max(0,1-Math.hypot((nx-.29)*3.5,(ny-.51)*3.5));
  c=[c[0]+glow*47,c[1]+glow*25,c[2]+glow*5,255]; put(dark,x,y,c);
 }
 save('farm-house-interior-v2.png',day);save('farm-house-interior-night-v2.png',dark);
}
console.log('Farm V3 layers rebuilt from the shared map at 3px/logical unit; day/night geometry is identical.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const scenes = fs.readdirSync('assets/images').filter(f => /^(farm|market)-scene-.*-v6\.webp$/.test(f));
assert.equal(scenes.length, 20);
assert.equal(new Set(scenes.map(f => crypto.createHash('sha256').update(fs.readFileSync('assets/images/' + f)).digest('hex'))).size, 20);
for (const [name, rows] of [['farm-classic-crops-stages-v7.png', 9], ['farm-new-crops-stages-v6.png', 3]]) {
 const p = PNG.sync.read(fs.readFileSync('assets/images/' + name));
 for (let row=0; row<rows; row++) for (let col=0; col<3; col++) {
  let filled=0;
  for(let y=Math.ceil(row*p.height/rows);y<Math.floor((row+1)*p.height/rows);y+=3)
   for(let x=Math.ceil(col*p.width/3);x<Math.floor((col+1)*p.width/3);x+=3)
    filled += p.data[(y*p.width+x)*4+3]>128;
  assert(filled>30, `${name} empty cell ${row},${col}`);
 }
}
console.log('Visual assets: 20 distinct scenes and all 36 crop stages present.');

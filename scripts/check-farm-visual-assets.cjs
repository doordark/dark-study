const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const dir = path.resolve(__dirname, '../assets/images');
const read = name => PNG.sync.read(fs.readFileSync(path.join(dir, name)));
for (const part of ['house', 'coop', 'market', 'pond', 'bench', 'tree']) {
  const original = read(`farm-${part}-v3.png`);
  for (const time of ['morning', 'evening']) {
    const image = read(`farm-${part}-${time}-v3.png`);
    assert.equal(image.width, original.width); assert.equal(image.height, original.height);
    for (let i = 3; i < original.data.length; i += 4) assert.equal(image.data[i], original.data[i], `${part} ${time} alpha`);
  }
}
const base = read('farm-terrain-noon-v4.png');
const oldBase = read('farm-day-v3.png');
for (let y = 136 * 3; y < 201 * 3; y++) for (let x = 85 * 3; x < 155 * 3; x++) {
  const i = (y * base.width + x) * 4;
  assert.ok(base.data.subarray(i, i + 4).equals(oldBase.data.subarray(i, i + 4)), 'plot pixels must remain registered');
}
for (const time of ['morning', 'evening', 'night']) {
  const variant = read(`farm-terrain-${time}-v4.png`);
  assert.equal(variant.width, base.width); assert.equal(variant.height, base.height);
}
for (const name of ['farm-people-family-v3.png', 'farm-people-family-idle-v3.png', 'farm-people-family-talk-v3.png']) {
  const image = read(name);
  assert.ok(Math.abs((image.width / 8) / (image.height / 5) - 1) < .01, `${name}: cells must be square`);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++) {
    let opaque = 0;
    for (let y = Math.ceil(row * image.height / 5); y < Math.floor((row + 1) * image.height / 5); y += 2)
      for (let x = Math.ceil(col * image.width / 8); x < Math.floor((col + 1) * image.width / 8); x += 2)
        if (image.data[(y * image.width + x) * 4 + 3] > 128) opaque++;
    assert.ok(opaque > 50, `${name}: empty frame ${row},${col}`);
  }
}
for (const time of ['morning', 'noon', 'evening', 'night']) {
  const image = read(`farm-outskirts-${time}-v3.png`);
  assert.ok(Math.abs(image.width / image.height - 200 / 330) < .005, `${time}: outskirts aspect ratio`);
}
// The central sky and the expansion must use the same night lighting.
const night = read('farm-terrain-night-v4.png');
const outskirtsNight = read('farm-outskirts-night-v3.png');
for (const y of [.04, .08, .12]) for (const x of [.02, .98]) {
  const at = (image, fx, fy, c) => image.data[(Math.floor(image.height * fy) * image.width + Math.floor(image.width * fx)) * 4 + c];
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(at(night, x, y, c) - at(outskirtsNight, x, y, c)) <= 10, 'night sky colors should match at the scene edge');
}
console.log('Farm visuals: aligned lighting alpha, 120 populated animation frames, and proportional outskirts verified.');

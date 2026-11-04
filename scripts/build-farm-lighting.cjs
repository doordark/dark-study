// Produce registered lighting variants without moving terrain, doors or hit areas.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const dir = path.resolve(__dirname, '../assets/images');
const files = ['house', 'coop', 'market', 'pond', 'bench', 'tree'];
function convert(source, target, mode) {
  const image = PNG.sync.read(fs.readFileSync(path.join(dir, source)));
  for (let i = 0; i < image.data.length; i += 4) {
    if (!image.data[i + 3]) continue;
    const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    const sky = source === 'farm-outskirts-noon-v3.png' && i / 4 / image.width < image.height * 60 / 330;
    const c = mode === 'morning' ? [r * .94 + 17, g * .94 + 10, b * .91 + 8]
      : mode === 'evening' ? [r * .76 + 52, g * .72 + 22, b * .74 + 12]
        : sky ? [r * .18 + 3, g * .23 + 5, b * .4 + 16] : [r * .35 + 5, g * .43 + 5, b * .64 + 14];
    for (let channel = 0; channel < 3; channel++) image.data[i + channel] = Math.min(255, Math.round(c[channel]));
  }
  fs.writeFileSync(path.join(dir, target), PNG.sync.write(image));
}
for (const name of files) {
  for (const mode of ['morning', 'evening']) {
    convert(`farm-${name}-v3.png`, `farm-${name}-${mode}-v3.png`, mode);
  }
}
// Redraw only open ground, keeping every interactive structure and route registered.
const terrain = PNG.sync.read(fs.readFileSync(path.join(dir, 'farm-day-v3.png')));
const oldNight = PNG.sync.read(fs.readFileSync(path.join(dir, 'farm-night-v3.png')));
const redraw = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, '../assets/farm-v3/terrain-redraw-source-v4.png')));
const updated = PNG.sync.read(fs.readFileSync(path.join(dir, 'farm-day-v3.png')));
const updatedNight = PNG.sync.read(fs.readFileSync(path.join(dir, 'farm-night-v3.png')));
// Logical map coordinates. Feather edges to avoid visible seams.
const patches = [[0, 136, 24, 180], [0, 220, 45, 230], [0, 307, 70, 326], [55, 278, 118, 325], [158, 200, 200, 250], [164, 305, 200, 326], [87, 65, 122, 108], [163, 75, 198, 130]];
for (let y = 0; y < terrain.height; y++) for (let x = 0; x < terrain.width; x++) {
  const px = x / 3, py = y / 3;
  const edge = Math.max(0, ...patches.map(([l,t,r,b]) => Math.min(px-l, r-px, py-t, b-py)));
  const amount = Math.min(1, edge / 4);
  if (!amount) continue;
  const src = (Math.min(redraw.height - 1, Math.floor(y * redraw.height / terrain.height)) * redraw.width + Math.min(redraw.width - 1, Math.floor(x * redraw.width / terrain.width))) * 4;
  const dst = (y * terrain.width + x) * 4;
  for (let c = 0; c < 3; c++) {
    const before = terrain.data[dst + c], after = redraw.data[src + c];
    updated.data[dst + c] = Math.round(before * (1 - amount) + after * amount);
    updatedNight.data[dst + c] = Math.max(0, Math.min(255, Math.round(oldNight.data[dst + c] + (after - before) * amount * [0.35, 0.43, 0.64][c])));
  }
}
fs.writeFileSync(path.join(dir, 'farm-terrain-noon-v4.png'), PNG.sync.write(updated));
fs.writeFileSync(path.join(dir, 'farm-terrain-night-v4.png'), PNG.sync.write(updatedNight));
for (const mode of ['morning', 'evening']) convert('farm-terrain-noon-v4.png', `farm-terrain-${mode}-v4.png`, mode);
// Use the terrain's pixel density for the expansion; keep the generated source separately.
const original = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, '../assets/farm-v3/outskirts-source-v3.png')));
const outskirts = new PNG({ width: 600, height: Math.round(600 * original.height / original.width), colorType: 6 });
for (let y = 0; y < outskirts.height; y++) for (let x = 0; x < outskirts.width; x++) {
  const src = (Math.min(original.height - 1, Math.floor(y * original.height / outskirts.height)) * original.width + Math.min(original.width - 1, Math.floor(x * original.width / outskirts.width))) * 4;
  original.data.copy(outskirts.data, (y * outskirts.width + x) * 4, src, src + 4);
}
fs.writeFileSync(path.join(dir, 'farm-outskirts-noon-v3.png'), PNG.sync.write(outskirts));
for (const mode of ['morning', 'evening', 'night']) {
  convert('farm-outskirts-noon-v3.png', `farm-outskirts-${mode}-v3.png`, mode);
}
console.log('Built aligned morning and evening lighting variants and outskirts.');

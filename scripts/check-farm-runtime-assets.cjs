const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const root = path.join(__dirname, '../assets/images/farm-runtime');
const metrics = JSON.parse(fs.readFileSync(path.join(root, 'metrics.json')));
let sourceBytes = 0, runtimeBytes = 0, frames = 0;
for (const entry of metrics) {
  const image = PNG.sync.read(fs.readFileSync(path.join(root, entry.file)));
  assert.equal(image.width, entry.width);
  assert.equal(image.height, entry.height);
  assert.equal(image.width % entry.columns, 0);
  assert.equal(image.height % entry.rows, 0);
  assert.equal(image.width * image.height * 4, entry.runtimeRGBABytes);
  const w = image.width / entry.columns, h = image.height / entry.rows;
  for (let row = 0; row < entry.rows; row++) for (let col = 0; col < entry.columns; col++) {
    let opaque = 0, transparent = 0;
    for (let y = row * h; y < (row + 1) * h; y++) for (let x = col * w; x < (col + 1) * w; x++) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      opaque += alpha > 128; transparent += alpha === 0;
    }
    assert(opaque > 100 && transparent > 100, `${entry.file} frame ${row},${col} must retain artwork and alpha`);
    frames++;
  }
  sourceBytes += entry.sourceRGBABytes; runtimeBytes += entry.runtimeRGBABytes;
}
assert(runtimeBytes < sourceBytes * 0.5, 'runtime atlases should save at least half the raw RGBA footprint');
console.log(`PASS: ${frames} runtime frames; RGBA estimate ${(sourceBytes/1048576).toFixed(2)} -> ${(runtimeBytes/1048576).toFixed(2)} MiB`);

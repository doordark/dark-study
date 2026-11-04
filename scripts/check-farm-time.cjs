const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/utils/farmTime.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const domain = new Module(filename, module);
domain._compile(compiled.outputText, filename);
const { farmTime } = domain.exports;
const epoch = new Date(2026, 10, 3).getTime();
const day = 86400000;
for (const [hour, minute, night] of [[0, 0, true], [5, 59, true], [6, 0, false], [12, 0, false], [18, 59, false], [19, 0, true], [23, 59, true]]) {
  const real = new Date(2026, 10, 3, hour, minute).getTime();
  for (const shift of [0, 12 * 3600000, 7 * day, 365 * day]) {
    const result = farmTime(real, shift, epoch);
    assert.equal(result.night, night, `local ${hour}:${minute}, bonus ${shift}: lighting must follow reality`);
    assert.equal(result.clock, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    assert.equal(result.growthNow, real + shift, "saved bonuses must still advance crops");
    assert.equal(result.weather, farmTime(real, 0, epoch).weather, "saved bonuses must not reroll weather");
  }
}
const noon = new Date(2026, 10, 3, 12).getTime();
for (const [hour, expected] of [[0, 'night'], [5, 'night'], [6, 'morning'], [10, 'morning'], [11, 'noon'], [16, 'noon'], [17, 'evening'], [18, 'evening'], [19, 'night']]) {
  assert.equal(farmTime(new Date(2026, 10, 3, hour).getTime(), 0, epoch).period, expected);
}
assert.equal(farmTime(noon, 7 * day, epoch).day, 8);
assert.equal(farmTime(noon, 7 * day, epoch).season, 1);
assert.equal(farmTime(noon, 28 * day, epoch).season, 0);
assert.equal(farmTime(noon, 0, epoch + day).day, 1, "a future epoch must not create day zero");
for (const hour of [8, 12, 18, 23]) {
  const weather = new Set(Array.from({ length: 30 }, (_, offset) =>
    farmTime(new Date(2026, 10, 3 + offset, hour).getTime(), 0, epoch).weather));
  assert.deepEqual(weather, new Set(["clear", "rain"]));
}
console.log("Farm clock checks passed: dawn/dusk boundaries, saved offsets, real clock, growth, days and seasons.");

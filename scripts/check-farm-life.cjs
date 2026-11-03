const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/utils/farmLife.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const domain = new Module(filename, module);
domain._compile(compiled.outputText, filename);
const p = domain.exports;
const at = new Date(2026, 10, 3, 12).getTime();
const nextDay = new Date(2026, 10, 4, 12).getTime();
const empty = p.normalizeLifeUsage(null, at);
assert.equal(p.DEFAULT_LIFE.online, false, "automatic dialogue starts offline");
assert.equal(p.reserveLifeRequest(empty, p.DEFAULT_LIFE, at), null);
const settings = { ...p.DEFAULT_LIFE, online: true };
let usage = p.reserveLifeRequest(empty, settings, at);
assert.equal(usage.count, 1);
assert.equal(p.reserveLifeRequest(usage, settings, at + 599999), null, "cooldown is enforced");
usage = p.normalizeLifeUsage(JSON.parse(JSON.stringify(usage)), at + 600000);
usage = p.reserveLifeRequest(usage, settings, at + 600000);
assert.equal(usage.count, 2, "reload preserves the daily count and cooldown");
usage = p.reserveLifeRequest(usage, settings, at + 1200000);
assert.equal(usage.count, 3);
assert.equal(p.reserveLifeRequest(usage, settings, at + 1800000), null, "daily limit stops requests");
assert.equal(p.reserveLifeRequest(usage, settings, nextDay).count, 1, "new real day resets count");
assert.equal(p.reserveLifeRequest({ ...empty, lastAt: at + 600000 }, settings, at), null, "clock rollback does not bypass cooldown");
assert.equal(p.reserveLifeRequest(empty, { ...settings, chatter: false }, at), null);
assert.deepEqual(p.normalizeLifeSettings({ interval: 1, dailyLimit: 999, aiMinutes: -1, online: "true" }), p.DEFAULT_LIFE);
assert.deepEqual(p.normalizeLifeUsage({ date: p.lifeDate(at), count: -2, lastAt: NaN }, at), empty);
const pair = ["door", "gu"];
const reply = (lines) => JSON.stringify({ lines });
const lines = [{ speaker: "door", text: " 浇完水就休息。 " }, { speaker: "gu", text: "我陪你。" }];
assert.equal(p.readLifeReply(reply(lines), pair)[0].text, "浇完水就休息。");
for (const invalid of ["not json", "null", reply([]), reply([...lines, lines[0]]), reply(lines.slice().reverse()), reply([{ ...lines[0], text: " " }, lines[1]]), reply([{ ...lines[0], text: "长".repeat(45) }, lines[1]]), reply([null, lines[1]])]) {
  assert.equal(p.readLifeReply(invalid, pair), null, "malformed responses use local fallback");
}
for (const scene of p.LOCAL_SCENES) {
  assert.ok(p.readLifeReply(reply(scene.pair.map((speaker, i) => ({ speaker, text: scene.lines[i] }))), scene.pair), "all local dialogue follows the same validation");
}
console.log("Farm life checks passed: offline default, persistent cap, cooldown, date reset, clock rollback and strict two-line replies.");

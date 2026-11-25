const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const loadProjectTs = require("./load-project-ts.cjs")();

const quotesMod = loadProjectTs("src/constants/nightSkyQuotes.ts");
const {
  NIGHT_SKY_QUOTES,
  QUOTE_CATEGORY_LABELS,
  createQuoteBag,
  formatQuoteAttribution,
  parseHitokotoQuote,
} = quotesMod;

// 1. Curated quote bank quality & uniqueness checks
assert.ok(
  NIGHT_SKY_QUOTES.length >= 40,
  `Expected >= 40 curated quotes, got ${NIGHT_SKY_QUOTES.length}`,
);
const ids = new Set();
const texts = new Set();
const categories = new Set();
for (const q of NIGHT_SKY_QUOTES) {
  assert.ok(q.id && !ids.has(q.id), `Duplicate or empty quote id: ${q.id}`);
  ids.add(q.id);
  assert.ok(q.text && !texts.has(q.text), `Duplicate or empty quote text: ${q.id}`);
  texts.add(q.text);
  assert.ok(
    q.text.length >= 8 && q.text.length <= 58,
    `Quote length out of card-friendly range (${q.text.length}): ${q.id}`,
  );
  assert.ok(
    q.category in QUOTE_CATEGORY_LABELS,
    `Unknown category ${q.category} on ${q.id}`,
  );
  categories.add(q.category);
  const attr = formatQuoteAttribution(q);
  assert.ok(attr.startsWith("—— "), `Missing attribution for ${q.id}`);
}
assert.ok(categories.has("book") && categories.has("film") && categories.has("anime") && categories.has("essay"));

// 2. Attribution formatting edge cases
assert.equal(
  formatQuoteAttribution({ author: "阿尔贝·加缪", work: "《重返蒂帕萨》" }),
  "—— 阿尔贝·加缪《重返蒂帕萨》",
);
assert.equal(
  formatQuoteAttribution({ work: "白日梦想家" }),
  "—— 《白日梦想家》",
);
assert.equal(
  formatQuoteAttribution({ author: "泰戈尔", work: "" }),
  "—— 泰戈尔",
);

// 3. Shuffle bag non-repeating cycle check
let seed = 42;
const deterministicRng = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const bag = createQuoteBag(NIGHT_SKY_QUOTES, deterministicRng);
const firstRound = new Set();
let prev = null;
for (let i = 0; i < NIGHT_SKY_QUOTES.length; i++) {
  const item = bag.next(prev?.id);
  assert.notEqual(item.id, prev?.id, "Consecutive quote repeated");
  firstRound.add(item.id);
  prev = item;
}
assert.equal(firstRound.size, NIGHT_SKY_QUOTES.length, "Full bag cycle should cover every quote once");
const nextCycleFirst = bag.next(prev.id);
assert.notEqual(nextCycleFirst.id, prev.id, "Cross-cycle boundary should avoid repeating last quote");

// 4. Online Hitokoto parser validation
const goodOnline = parseHitokotoQuote({
  uuid: "abc-123",
  hitokoto: "“往者不可谏，来者犹可追。珍惜眼前星光。”",
  from: "《论语·微子篇》",
  from_who: "孔子",
});
assert.ok(goodOnline);
assert.equal(goodOnline.category, "online");
assert.equal(goodOnline.text, "往者不可谏，来者犹可追。珍惜眼前星光。");
assert.equal(formatQuoteAttribution(goodOnline), "—— 孔子《论语·微子篇》");

assert.equal(
  parseHitokotoQuote({ hitokoto: "太短了", from: "某书" }),
  null,
  "Too-short quotes should be rejected",
);
assert.equal(
  parseHitokotoQuote({ hitokoto: "这是一句长度合格但没有有效出处的网络句子。", from: "网络", from_who: null }),
  null,
  "Unattributed/placeholder online quotes should be rejected",
);
assert.equal(
  parseHitokotoQuote({ hitokoto: "包含换行\n的异常文本不应该通过校验", from: "测试" }),
  null,
  "Multiline text should be rejected",
);

// 5. Star scale MP3 assets & soundEffects scale mapping checks
const sfxDir = path.resolve(__dirname, "../assets/sfx");
for (let i = 1; i <= 7; i++) {
  const fp = path.join(sfxDir, `star_note_${i}.mp3`);
  assert.ok(fs.existsSync(fp), `Missing ${fp}`);
  const size = fs.statSync(fp).size;
  assert.ok(size > 1500 && size < 20000, `Unexpected size for star_note_${i}.mp3: ${size}`);
}
assert.ok(fs.statSync(path.join(sfxDir, "star_constellation.mp3")).size > 4000);
assert.ok(fs.statSync(path.join(sfxDir, "owl_hoot.mp3")).size > 2000);

const soundEffectsSrc = fs.readFileSync(
  path.resolve(__dirname, "../src/services/soundEffects.ts"),
  "utf8",
);
for (let i = 1; i <= 7; i++) {
  assert.ok(
    soundEffectsSrc.includes(`star_note_${i}: require("../../assets/sfx/star_note_${i}.mp3")`),
    `soundEffects.ts missing star_note_${i}`,
  );
}
assert.ok(soundEffectsSrc.includes("export function playStarScaleNote("));
assert.ok(soundEffectsSrc.includes("export function resolveStarScaleSfx("));

const nightSkySrc = fs.readFileSync(
  path.resolve(__dirname, "../src/components/NightSky.tsx"),
  "utf8",
);
assert.ok(nightSkySrc.includes("playStarScaleNote("), "NightSky.tsx should play scale note on star collect");
assert.ok(nightSkySrc.includes('playSfx("star_constellation"'), "NightSky.tsx should play constellation chord");
assert.ok(nightSkySrc.includes('playSfx("owl_hoot"'), "NightSky.tsx should play owl hoot on owl tap");

const scheduleSrc = fs.readFileSync(
  path.resolve(__dirname, "../src/screens/CourseScheduleScreen.tsx"),
  "utf8",
);
assert.ok(scheduleSrc.includes("playStarScaleNote("), "CourseScheduleScreen.tsx should play scale note on charge tap");

console.log(
  `NightSky checks passed: ${NIGHT_SKY_QUOTES.length} curated quotes, shuffle bag, Hitokoto validator, 7-note C-major scale MP3s & wiring.`,
);

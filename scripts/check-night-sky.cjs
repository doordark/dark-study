const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mockDisk = new Map();
const mockAsyncStorage = {
  getItem: async (k) => mockDisk.get(k) ?? null,
  setItem: async (k, v) => {
    mockDisk.set(k, v);
  },
  removeItem: async (k) => {
    mockDisk.delete(k);
  },
};

const loadProjectTs = require("./load-project-ts.cjs")({
  "@react-native-async-storage/async-storage": mockAsyncStorage,
});

const quotesMod = loadProjectTs("src/constants/nightSkyQuotes.ts");
const {
  BLOOD_MOON_QUOTES,
  NIGHT_SKY_QUOTES,
  QUOTE_CATEGORY_LABELS,
  createQuoteBag,
  formatQuoteAttribution,
  parseHitokotoQuote,
} = quotesMod;

const dataMod = loadProjectTs("src/utils/nightSkyData.ts");
const {
  DEFAULT_NIGHT_CHRONICLE,
  LEGACY_VISIT_KEY,
  MAX_FAVORITE_QUOTES,
  MAX_NIGHT_WISHES,
  MOON_PHASE_NAMES,
  NIGHT_CHRONICLE_KEY,
  NIGHT_CONSTELLATIONS,
  NIGHT_WISHES_KEY,
  SECRET_BADGES,
  STAR_DEW_BLESSING_KEY,
  STAR_DEW_COOLDOWN_KEY,
  TOTAL_STARS,
  addNightWish,
  buildMeteorCoursePool,
  buildStarDewTownEvent,
  buildWhaleSkyLine,
  consumeStarDewBlessing,
  formatCourseMeteorPop,
  getCelestialEvent,
  getMoonPhaseInfo,
  getOwlDialogue,
  getScheduleMoodNote,
  loadAndBumpNightChronicle,
  loadNightWishes,
  markWishEchoed,
  matchSecretMelody,
  parseFavoriteQuotes,
  parseNightChronicle,
  parseNightWishes,
  pickEchoWish,
  pickInitialConstellationIndex,
  pickNextConstellationIndex,
  recordNightVisit,
  saveNightWishes,
  toggleFavoriteQuote,
  unlockConstellationInChronicle,
  unlockSecretBadgeInChronicle,
  writeStarDewBlessing,
} = dataMod;

async function main() {
  // 1. Curated quote bank quality, category balance & uniqueness checks
  assert.ok(
    NIGHT_SKY_QUOTES.length >= 60,
    `Expected >= 60 curated quotes, got ${NIGHT_SKY_QUOTES.length}`,
  );
  const ids = new Set();
  const texts = new Set();
  const categoryCounts = new Map();
  for (const q of NIGHT_SKY_QUOTES) {
    assert.ok(q.id && !ids.has(q.id), `Duplicate or empty quote id: ${q.id}`);
    ids.add(q.id);
    assert.ok(
      q.text && !texts.has(q.text),
      `Duplicate or empty quote text: ${q.id}`,
    );
    texts.add(q.text);
    assert.ok(
      q.text.length >= 8 && q.text.length <= 58,
      `Quote length out of card-friendly range (${q.text.length}): ${q.id}`,
    );
    assert.ok(
      q.category in QUOTE_CATEGORY_LABELS,
      `Unknown category ${q.category} on ${q.id}`,
    );
    categoryCounts.set(q.category, (categoryCounts.get(q.category) || 0) + 1);
    const attr = formatQuoteAttribution(q);
    assert.ok(attr.startsWith("—— "), `Missing attribution for ${q.id}`);
  }
  assert.ok((categoryCounts.get("book") || 0) >= 20);
  assert.ok((categoryCounts.get("essay") || 0) >= 10);
  assert.ok((categoryCounts.get("film") || 0) >= 14);
  assert.ok((categoryCounts.get("anime") || 0) >= 8);

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
  assert.equal(
    firstRound.size,
    NIGHT_SKY_QUOTES.length,
    "Full bag cycle should cover every quote once",
  );
  const nextCycleFirst = bag.next(prev.id);
  assert.notEqual(
    nextCycleFirst.id,
    prev.id,
    "Cross-cycle boundary should avoid repeating last quote",
  );

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
  assert.equal(
    formatQuoteAttribution(goodOnline),
    "—— 孔子《论语·微子篇》",
  );

  assert.equal(
    parseHitokotoQuote({ hitokoto: "太短了", from: "某书" }),
    null,
    "Too-short quotes should be rejected",
  );
  assert.equal(
    parseHitokotoQuote({
      hitokoto: "这是一句长度合格但没有有效出处的网络句子。",
      from: "网络",
      from_who: null,
    }),
    null,
    "Unattributed/placeholder online quotes should be rejected",
  );
  assert.equal(
    parseHitokotoQuote({
      hitokoto: "包含换行\n的异常文本不应该通过校验",
      from: "测试",
    }),
    null,
    "Multiline text should be rejected",
  );

  // 5. Multi-constellation geometry, spacing & rotation checks
  assert.ok(
    NIGHT_CONSTELLATIONS.length >= 6,
    `Expected >= 6 constellations, got ${NIGHT_CONSTELLATIONS.length}`,
  );
  const cIds = new Set();
  for (const c of NIGHT_CONSTELLATIONS) {
    assert.ok(c.id && !cIds.has(c.id), `Duplicate constellation id: ${c.id}`);
    cIds.add(c.id);
    assert.ok(c.name && c.subtitle && c.motto, `Missing metadata on ${c.id}`);
    assert.equal(c.spots.length, TOTAL_STARS, `${c.id} must have 7 stars`);
    for (let i = 0; i < c.spots.length; i++) {
      const s = c.spots[i];
      assert.ok(
        s.x >= 0.1 && s.x <= 0.9 && s.y >= 0.06 && s.y <= 0.94,
        `${c.id} star ${i} out of safe sky bounds`,
      );
      for (let j = i + 1; j < c.spots.length; j++) {
        const dist = Math.hypot(s.x - c.spots[j].x, s.y - c.spots[j].y);
        assert.ok(
          dist >= 0.15,
          `${c.id} stars ${i} and ${j} are too close (${dist.toFixed(3)})`,
        );
      }
    }
    const touched = new Set();
    for (const [a, b] of c.edges) {
      assert.ok(
        a >= 0 && a < TOTAL_STARS && b >= 0 && b < TOTAL_STARS && a !== b,
        `${c.id} invalid edge [${a}, ${b}]`,
      );
      touched.add(a);
      touched.add(b);
    }
    assert.equal(
      touched.size,
      TOTAL_STARS,
      `${c.id} edges must cover all 7 stars`,
    );
  }
  assert.equal(pickInitialConstellationIndex(1, []), 0);
  assert.equal(
    pickInitialConstellationIndex(2, ["big-dipper"], "big-dipper"),
    1,
    "Should prefer unlit constellation on returning visit",
  );
  const allIds = NIGHT_CONSTELLATIONS.map((c) => c.id);
  const rotated = pickInitialConstellationIndex(3, allIds, NIGHT_CONSTELLATIONS[2].id);
  assert.notEqual(
    NIGHT_CONSTELLATIONS[rotated].id,
    NIGHT_CONSTELLATIONS[2].id,
    "Should avoid repeating last constellation when all unlocked",
  );
  assert.equal(pickNextConstellationIndex(0, ["big-dipper", "cassiopeia"]), 2);

  // 6. Astronomical moon phase & New Moon earthshine floor checks
  const newMoon = getMoonPhaseInfo(new Date(2024, 3, 8));
  assert.equal(newMoon.index, 0);
  assert.equal(newMoon.name, MOON_PHASE_NAMES[0]);
  assert.ok(newMoon.illumination < 0.05);
  assert.ok(
    newMoon.haloStrength >= 0.2,
    "New moon must retain subtle earthshine halo floor",
  );

  const fullMoon = getMoonPhaseInfo(new Date(2024, 3, 23));
  assert.equal(fullMoon.index, 4);
  assert.equal(fullMoon.name, MOON_PHASE_NAMES[4]);
  assert.ok(fullMoon.illumination > 0.94);
  assert.ok(fullMoon.ageDays >= 13.5 && fullMoon.ageDays <= 16.5);
  assert.ok(fullMoon.note.length > 0);

  // 7. Course meteor deduplication & full-schedule rotation pool checks
  const meteorPool = buildMeteorCoursePool([
    "  ",
    "高等数学",
    "高等数学",
    "Linear Algebra",
    "linear algebra",
    "大学物理实验（上）超级长名称截断测试",
    "数据结构与算法",
  ]);
  assert.deepEqual(meteorPool, [
    "高等数学",
    "Linear Algeb",
    "大学物理实验（上）超级长",
    "数据结构与算法",
  ]);

  // 8. Night chronicle legacy migration, persistence & favorites cap checks
  const migrated = parseNightChronicle(null, "9");
  assert.equal(migrated.visits, 9);
  assert.deepEqual(migrated.unlockedConstellations, []);
  const recovered = parseNightChronicle("{invalid json", "5");
  assert.equal(recovered.visits, 5);

  let chron = recordNightVisit(DEFAULT_NIGHT_CHRONICLE);
  chron = unlockConstellationInChronicle(chron, "big-dipper", 7);
  chron = unlockConstellationInChronicle(chron, "big-dipper", 7);
  chron = unlockConstellationInChronicle(chron, "unknown-id", 0);
  assert.equal(chron.visits, 1);
  assert.equal(chron.totalStarsCollected, 14);
  assert.deepEqual(chron.unlockedConstellations, ["big-dipper"]);

  mockDisk.clear();
  mockDisk.set(LEGACY_VISIT_KEY, "6");
  const bumped = await loadAndBumpNightChronicle();
  assert.equal(bumped.visits, 7);
  assert.equal(mockDisk.get(LEGACY_VISIT_KEY), "7");
  assert.ok(mockDisk.get(NIGHT_CHRONICLE_KEY));

  let favs = [];
  const q1 = NIGHT_SKY_QUOTES[0];
  let toggleRes = toggleFavoriteQuote(favs, q1);
  assert.equal(toggleRes.saved, true);
  assert.equal(toggleRes.next.length, 1);
  favs = toggleRes.next;
  toggleRes = toggleFavoriteQuote(favs, q1);
  assert.equal(toggleRes.saved, false);
  assert.equal(toggleRes.next.length, 0);

  let manyFavs = [];
  for (let i = 0; i < MAX_FAVORITE_QUOTES + 5; i++) {
    manyFavs = toggleFavoriteQuote(manyFavs, NIGHT_SKY_QUOTES[i]).next;
  }
  assert.equal(manyFavs.length, MAX_FAVORITE_QUOTES);
  const parsedFavs = parseFavoriteQuotes(
    JSON.stringify([q1, q1, { id: "bad", text: "" }, { id: "x", text: "ok", work: "w", category: "invalid" }]),
  );
  assert.equal(parsedFavs.length, 1);

  // 9. Context-aware owl dialogue checks
  const firstLines = getOwlDialogue({
    hour: 2,
    visits: 1,
    owlPathUnlocked: false,
    constellationName: "北斗七星",
  });
  assert.equal(firstLines.length, 5);
  assert.ok(firstLines[0].includes("夜深"));
  const returnLines = getOwlDialogue({
    hour: 21,
    visits: 8,
    owlPathUnlocked: true,
    constellationName: "天鹅渡河",
  });
  assert.equal(returnLines.length, 4);
  assert.ok(returnLines[0].includes("8"));
  assert.ok(returnLines[1].includes("天鹅渡河"));

  // 10. Star scale MP3 assets & soundEffects scale mapping checks
  const sfxDir = path.resolve(__dirname, "../assets/sfx");
  for (let i = 1; i <= 7; i++) {
    const fp = path.join(sfxDir, `star_note_${i}.mp3`);
    assert.ok(fs.existsSync(fp), `Missing ${fp}`);
    const size = fs.statSync(fp).size;
    assert.ok(
      size > 1500 && size < 20000,
      `Unexpected size for star_note_${i}.mp3: ${size}`,
    );
  }
  assert.ok(
    fs.statSync(path.join(sfxDir, "star_constellation.mp3")).size > 4000,
  );
  assert.ok(fs.statSync(path.join(sfxDir, "owl_hoot.mp3")).size > 2000);

  const soundEffectsSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/services/soundEffects.ts"),
    "utf8",
  );
  for (let i = 1; i <= 7; i++) {
    assert.ok(
      soundEffectsSrc.includes(
        `star_note_${i}: require("../../assets/sfx/star_note_${i}.mp3")`,
      ),
      `soundEffects.ts missing star_note_${i}`,
    );
  }
  assert.ok(soundEffectsSrc.includes("export function playStarScaleNote("));
  assert.ok(soundEffectsSrc.includes("export function resolveStarScaleSfx("));

  const nightSkySrc = fs.readFileSync(
    path.resolve(__dirname, "../src/components/NightSky.tsx"),
    "utf8",
  );
  assert.ok(
    nightSkySrc.includes("playStarScaleNote("),
    "NightSky.tsx should play scale note on star collect",
  );
  assert.ok(
    nightSkySrc.includes('playSfx("star_constellation"'),
    "NightSky.tsx should play constellation chord",
  );
  assert.ok(
    nightSkySrc.includes('playSfx("owl_hoot"'),
    "NightSky.tsx should play owl hoot on owl tap",
  );
  assert.ok(
    nightSkySrc.includes("HarpStarNode"),
    "NightSky.tsx should include playable star harp nodes",
  );
  assert.ok(
    nightSkySrc.includes("WishMeteor"),
    "NightSky.tsx should include wish meteor interaction",
  );

  const scheduleSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/screens/CourseScheduleScreen.tsx"),
    "utf8",
  );
  assert.ok(
    scheduleSrc.includes("playStarScaleNote("),
    "CourseScheduleScreen.tsx should play scale note on charge tap",
  );

  // 11. Hidden melodies, secret badges & extended chronicle checks
  assert.deepEqual(
    Object.keys(SECRET_BADGES).sort(),
    ["blood-moon", "star-musician", "whale-watcher", "wish-keeper"],
  );
  for (const [id, meta] of Object.entries(SECRET_BADGES)) {
    assert.ok(meta.label && meta.hint, `Badge ${id} missing label or hint`);
  }

  const twinkleMatch = matchSecretMelody([3, 1, 0, 0, 4, 4, 5, 5, 4]);
  assert.ok(twinkleMatch);
  assert.equal(twinkleMatch.id, "twinkle");
  assert.equal(twinkleMatch.badgeId, "star-musician");
  assert.equal(twinkleMatch.title, "小星星 · 银河流星雨");
  assert.ok(twinkleMatch.message.length > 0);

  const maj7Match = matchSecretMelody([6, 0, 2, 4, 6]);
  assert.ok(maj7Match);
  assert.equal(maj7Match.id, "maj7");
  assert.equal(maj7Match.badgeId, "star-musician");
  assert.equal(maj7Match.title, "星弦大七和弦 · 流萤旋舞");
  assert.ok(maj7Match.message.length > 0);

  assert.equal(matchSecretMelody([0, 0, 4, 4, 5, 5]), null);
  assert.equal(matchSecretMelody([0, 1, 2, 3]), null);
  assert.equal(matchSecretMelody([]), null);

  assert.deepEqual(DEFAULT_NIGHT_CHRONICLE.secretBadges, []);
  assert.equal(DEFAULT_NIGHT_CHRONICLE.wishesSent, 0);
  assert.equal(DEFAULT_NIGHT_CHRONICLE.meteorsTapped, 0);

  const legacyChron = parseNightChronicle(
    JSON.stringify({
      visits: 4,
      totalStarsCollected: 14,
      unlockedConstellations: ["big-dipper"],
      owlPathUnlocked: true,
    }),
  );
  assert.deepEqual(legacyChron.secretBadges, []);
  assert.equal(legacyChron.wishesSent, 0);
  assert.equal(legacyChron.meteorsTapped, 0);

  const parsedNewChron = parseNightChronicle(
    JSON.stringify({
      visits: 5,
      secretBadges: ["blood-moon", "blood-moon", "fake-badge", "wish-keeper"],
      wishesSent: 3.9,
      meteorsTapped: -2,
    }),
  );
  assert.deepEqual(parsedNewChron.secretBadges, ["blood-moon", "wish-keeper"]);
  assert.equal(parsedNewChron.wishesSent, 3);
  assert.equal(parsedNewChron.meteorsTapped, 0);

  let badgeChron = unlockSecretBadgeInChronicle(
    DEFAULT_NIGHT_CHRONICLE,
    "star-musician",
  );
  assert.deepEqual(badgeChron.secretBadges, ["star-musician"]);
  const badgeChronAgain = unlockSecretBadgeInChronicle(
    badgeChron,
    "star-musician",
  );
  assert.equal(
    badgeChronAgain,
    badgeChron,
    "Unlocking existing badge should preserve object reference",
  );
  badgeChron = unlockSecretBadgeInChronicle(badgeChron, "whale-watcher");
  assert.deepEqual(badgeChron.secretBadges, ["star-musician", "whale-watcher"]);

  // 12. Extended owl dialogue (melody hint, sleepy watch, heavy schedule empathy)
  assert.ok(
    returnLines.some((line) => line.includes("1-1-5-5-6-6-5")),
    "Returning owl dialogue should include subtle melody hint",
  );
  const sleepyFirst = getOwlDialogue({
    hour: 3,
    visits: 1,
    owlPathUnlocked: false,
    constellationName: "北斗七星",
    todayCourseCount: 5,
    sleepy: true,
  });
  assert.equal(sleepyFirst.length, 5);
  assert.ok(sleepyFirst[0].includes("夜深"));
  assert.ok(sleepyFirst.some((line) => line.includes("5")));

  const sleepyHeavyReturn = getOwlDialogue({
    hour: 3,
    visits: 12,
    owlPathUnlocked: true,
    constellationName: "猎户守望",
    todayCourseCount: 6,
    sleepy: true,
  });
  assert.equal(sleepyHeavyReturn.length, 4);
  assert.ok(sleepyHeavyReturn[0].includes("12"));
  assert.ok(sleepyHeavyReturn[1].includes("猎户守望"));
  assert.ok(sleepyHeavyReturn[1].includes("1-1-5-5-6-6-5"));
  assert.ok(sleepyHeavyReturn[2].includes("6"));

  // 13. Star Wish Capsules (bounded MAX_NIGHT_WISHES, sanitization, echo selection & storage)
  assert.equal(MAX_NIGHT_WISHES, 30);
  const baseNow = 1_750_000_000_000;
  let wishes = addNightWish([], "   \n  ", "北斗七星", baseNow);
  assert.equal(wishes.length, 0, "Empty wish should be rejected");

  const longText = "希望能顺利通过期末高数考试并且每天都能按时睡觉看一次完整的流星雨呢";
  wishes = addNightWish(wishes, `  ${longText}  `, "北斗七星", baseNow);
  assert.equal(wishes.length, 1);
  assert.ok(wishes[0].text.length <= 36);
  assert.equal(wishes[0].constellationName, "北斗七星");

  // Fill beyond MAX_NIGHT_WISHES to verify strict bounding
  let boundedWishes = [];
  for (let i = 0; i < MAX_NIGHT_WISHES + 10; i++) {
    boundedWishes = addNightWish(
      boundedWishes,
      `第 ${i + 1} 个星愿`,
      "天鹅渡河",
      baseNow + i * 1000,
    );
  }
  assert.equal(boundedWishes.length, MAX_NIGHT_WISHES);
  assert.equal(boundedWishes[0].text, `第 ${MAX_NIGHT_WISHES + 10} 个星愿`);

  // Echo selection: oldest un-echoed eligible wish (>= 12h default)
  const wOld = {
    id: "w-old",
    text: "最早的星愿",
    createdAt: baseNow - 24 * 3600 * 1000,
    constellationName: "北斗七星",
  };
  const wMid = {
    id: "w-mid",
    text: "十二小时前的星愿",
    createdAt: baseNow - 13 * 3600 * 1000,
    constellationName: "天琴夜曲",
  };
  const wFresh = {
    id: "w-fresh",
    text: "刚刚许下的星愿",
    createdAt: baseNow - 2 * 3600 * 1000,
    constellationName: "猎户守望",
  };
  const echoList = [wFresh, wMid, wOld];
  assert.equal(pickEchoWish(echoList, baseNow)?.id, "w-old");
  const afterEcho1 = markWishEchoed(echoList, "w-old", baseNow);
  assert.equal(afterEcho1.find((w) => w.id === "w-old")?.echoedAt, baseNow);
  assert.equal(pickEchoWish(afterEcho1, baseNow)?.id, "w-mid");
  const afterEcho2 = markWishEchoed(afterEcho1, "w-mid", baseNow);
  assert.equal(pickEchoWish(afterEcho2, baseNow), null);
  assert.equal(pickEchoWish(afterEcho2, baseNow, 3600 * 1000)?.id, "w-fresh");

  // parseNightWishes sanitization & persistence round-trip
  const parsedWishes = parseNightWishes(
    JSON.stringify([
      wOld,
      wOld,
      { id: "bad-empty", text: "   ", createdAt: baseNow, constellationName: "北斗" },
      { id: "bad-time", text: "ok", createdAt: -1, constellationName: "北斗" },
      { id: "bad-const", text: "ok", createdAt: baseNow, constellationName: "" },
    ]),
  );
  assert.equal(parsedWishes.length, 1);
  assert.equal(parsedWishes[0].id, "w-old");
  assert.deepEqual(parseNightWishes("{broken"), []);

  mockDisk.clear();
  await saveNightWishes(boundedWishes);
  assert.ok(mockDisk.get(NIGHT_WISHES_KEY));
  const loadedWishes = await loadNightWishes();
  assert.equal(loadedWishes.length, MAX_NIGHT_WISHES);

  // 14. Celestial calendar & late-night sleepy watch checks
  const nonFullMoon = { ...newMoon, index: 1 };
  const fullMoonStub = { ...fullMoon, index: 4 };

  const perseids = getCelestialEvent(new Date(2026, 7, 12, 22, 0), nonFullMoon);
  assert.equal(perseids.id, "perseids");
  assert.equal(perseids.meteorRateBoost, true);
  assert.equal(perseids.sleepyOwl, false);
  assert.ok(perseids.badge.length > 0);
  assert.ok(perseids.auroraPrimary.startsWith("#"));

  const perseidsLate = getCelestialEvent(new Date(2026, 7, 13, 3, 15), nonFullMoon);
  assert.equal(perseidsLate.id, "perseids");
  assert.equal(
    perseidsLate.sleepyOwl,
    true,
    "sleepyOwl must be true during 02:00..04:59 even on special celestial events",
  );

  const geminids = getCelestialEvent(new Date(2026, 11, 14, 21, 0), nonFullMoon);
  assert.equal(geminids.id, "geminids");
  assert.equal(geminids.meteorRateBoost, true);

  const summerSolstice = getCelestialEvent(new Date(2026, 5, 21, 21, 0), nonFullMoon);
  assert.equal(summerSolstice.id, "summer-solstice");

  const winterSolstice = getCelestialEvent(new Date(2026, 11, 22, 21, 0), nonFullMoon);
  assert.equal(winterSolstice.id, "winter-solstice");

  const newYearEve = getCelestialEvent(new Date(2026, 11, 31, 23, 30), nonFullMoon);
  assert.equal(newYearEve.id, "new-year");
  const newYearDay = getCelestialEvent(new Date(2027, 0, 1, 2, 10), nonFullMoon);
  assert.equal(newYearDay.id, "new-year");
  assert.equal(newYearDay.sleepyOwl, true);

  const fullMoonEvent = getCelestialEvent(new Date(2026, 3, 10, 21, 0), fullMoonStub);
  assert.equal(fullMoonEvent.id, "full-moon");
  assert.equal(fullMoonEvent.sleepyOwl, false);

  const lateWatch = getCelestialEvent(new Date(2026, 3, 10, 2, 0), nonFullMoon);
  assert.equal(lateWatch.id, "late-watch");
  assert.equal(lateWatch.sleepyOwl, true);

  const calmNight = getCelestialEvent(new Date(2026, 3, 10, 21, 0), nonFullMoon);
  assert.equal(calmNight.id, "calm");
  assert.equal(calmNight.badge, "");
  assert.equal(calmNight.sleepyOwl, false);
  const calmAtFive = getCelestialEvent(new Date(2026, 3, 10, 5, 0), nonFullMoon);
  assert.equal(calmAtFive.id, "calm");
  assert.equal(calmAtFive.sleepyOwl, false);

  // 15. Course meteor pop quips
  const pop0 = formatCourseMeteorPop("高等数学", "猎户守望", 0);
  assert.ok(pop0.includes("《高等数学》") && pop0.includes("猎户守望"));
  const popDupBrackets = formatCourseMeteorPop("《线性代数》", "北斗七星", 1);
  assert.ok(!popDupBrackets.includes("《《"), "Should not double-wrap brackets");
  assert.ok(popDupBrackets.includes("《线性代数》") && popDupBrackets.includes("北斗七星"));
  const popFallback = formatCourseMeteorPop("   ", "", 2);
  assert.ok(popFallback.length > 0);

  // 16. Schedule pressure mood notes
  assert.equal(getScheduleMoodNote(undefined), null);
  assert.equal(getScheduleMoodNote(-1), null);
  assert.equal(getScheduleMoodNote(2), null);
  const zeroNote = getScheduleMoodNote(0);
  assert.ok(zeroNote && zeroNote.length > 0);
  const heavyNote = getScheduleMoodNote(5);
  assert.ok(heavyNote && heavyNote.includes("5"));

  // 17. Whale sky cameo line checks (natural rotation, zero whalePhrase suffix)
  const tsunLines = new Set();
  const happyLines = new Set();
  for (let tap = 0; tap < 7; tap++) {
    const tsunLine = buildWhaleSkyLine({
      whaleName: "大肥鱼",
      userName: "大爹",
      tsundere: 75,
      constellationName: "天鹅渡河",
      tapCount: tap,
    });
    assert.equal(tsunLine.mood, "tsun");
    assert.ok(
      tsunLine.text.includes("大肥鱼") &&
        tsunLine.text.includes("大爹") &&
        tsunLine.text.includes("天鹅渡河"),
      `Tsun line ${tap} missing dynamic context: ${tsunLine.text}`,
    );
    tsunLines.add(tsunLine.text);

    const happyLine = buildWhaleSkyLine({
      whaleName: "大肥鱼",
      userName: "旅人",
      tsundere: 20,
      constellationName: "小熊归途",
      tapCount: tap,
    });
    assert.equal(happyLine.mood, "happy");
    assert.ok(
      happyLine.text.includes("大肥鱼") &&
        happyLine.text.includes("旅人") &&
        happyLine.text.includes("小熊归途"),
      `Happy line ${tap} missing dynamic context: ${happyLine.text}`,
    );
    happyLines.add(happyLine.text);
  }
  assert.ok(
    tsunLines.size >= 6,
    `Expected >= 6 distinct tsun sky lines, got ${tsunLines.size}`,
  );
  assert.ok(
    happyLines.size >= 6,
    `Expected >= 6 distinct happy sky lines, got ${happyLines.size}`,
  );
  const legacyPhraseCheck = buildWhaleSkyLine({
    whaleName: "大肥鱼",
    userName: "小明",
    tsundere: 80,
    constellationName: "北斗七星",
    tapCount: 0,
  });
  assert.ok(!legacyPhraseCheck.text.includes("大爹来了"));

  // 18. Star-Dew blessing bridge (NightSky <-> FarmScreen)
  mockDisk.clear();
  const day1 = new Date(2026, 4, 10, 22, 30);
  const day1Later = new Date(2026, 4, 10, 23, 10);
  const day2 = new Date(2026, 4, 11, 8, 15);
  assert.equal(await consumeStarDewBlessing(day1), null);

  await writeStarDewBlessing(NIGHT_CONSTELLATIONS[0], day1);
  assert.ok(mockDisk.get(STAR_DEW_BLESSING_KEY));
  const firstConsume = await consumeStarDewBlessing(day1);
  assert.ok(firstConsume);
  assert.equal(firstConsume.canWaterToday, true);
  assert.equal(firstConsume.blessing.constellationId, NIGHT_CONSTELLATIONS[0].id);
  assert.equal(firstConsume.blessing.constellationName, NIGHT_CONSTELLATIONS[0].name);
  assert.equal(firstConsume.blessing.dateIso, "2026-05-10");
  assert.equal(mockDisk.get(STAR_DEW_BLESSING_KEY), undefined, "Blessing should be consumed once");
  assert.equal(mockDisk.get(STAR_DEW_COOLDOWN_KEY), "2026-05-10");
  assert.equal(await consumeStarDewBlessing(day1Later), null);

  // Second blessing on same day delivers rumor but respects daily watering cooldown
  await writeStarDewBlessing(NIGHT_CONSTELLATIONS[1], day1Later);
  const sameDayConsume = await consumeStarDewBlessing(day1Later);
  assert.ok(sameDayConsume);
  assert.equal(sameDayConsume.canWaterToday, false);
  assert.equal(sameDayConsume.blessing.constellationId, NIGHT_CONSTELLATIONS[1].id);

  // Next day resets watering cooldown
  await writeStarDewBlessing(NIGHT_CONSTELLATIONS[2], day2);
  const nextDayConsume = await consumeStarDewBlessing(day2);
  assert.ok(nextDayConsume);
  assert.equal(nextDayConsume.canWaterToday, true);
  assert.equal(nextDayConsume.blessing.dateIso, "2026-05-11");

  const townEv = buildStarDewTownEvent(nextDayConsume.blessing, baseNow);
  assert.equal(townEv.kind, "rumor");
  assert.equal(townEv.hotspot, "plaza");
  assert.deepEqual(townEv.knownBy, ["gu", "door", "xiaoba", "yujie"]);
  assert.equal(townEv.createdAt, baseNow);
  assert.ok(townEv.expiresAt > baseNow);
  assert.ok(townEv.title.includes(NIGHT_CONSTELLATIONS[2].name));
  assert.ok(townEv.detail.includes(NIGHT_CONSTELLATIONS[2].subtitle));

  // 19. BloodMoon quotes, anti-mistouch lock, luminous star, whale cameo & new WebP assets
  assert.ok(
    Array.isArray(BLOOD_MOON_QUOTES) && BLOOD_MOON_QUOTES.length >= 10,
    `Expected >= 10 BLOOD_MOON_QUOTES, got ${BLOOD_MOON_QUOTES?.length}`,
  );
  const bloodIds = new Set();
  for (const bq of BLOOD_MOON_QUOTES) {
    assert.ok(bq.id && !bloodIds.has(bq.id), `Duplicate/empty blood quote id: ${bq.id}`);
    bloodIds.add(bq.id);
    assert.ok(bq.text.length >= 8 && bq.text.length <= 60, `Blood quote length out of range: ${bq.id}`);
    assert.ok(formatQuoteAttribution(bq).startsWith("—— "), `Missing blood quote attribution: ${bq.id}`);
  }
  const bloodBag = createQuoteBag(BLOOD_MOON_QUOTES, deterministicRng);
  const bloodRound = new Set();
  let prevBlood = null;
  for (let i = 0; i < BLOOD_MOON_QUOTES.length; i++) {
    const item = bloodBag.next(prevBlood?.id);
    assert.notEqual(item.id, prevBlood?.id);
    bloodRound.add(item.id);
    prevBlood = item;
  }
  assert.equal(bloodRound.size, BLOOD_MOON_QUOTES.length);

  assert.ok(
    nightSkySrc.includes("BLOOD_MOON_ENTRY_LOCK_MS = 3000"),
    "NightSky.tsx must define BLOOD_MOON_ENTRY_LOCK_MS = 3000",
  );
  assert.ok(
    nightSkySrc.includes("bloodMoonEnteredAtRef") &&
      nightSkySrc.includes("bloodMoonPhase"),
    "NightSky.tsx must track bloodMoonEnteredAtRef and bloodMoonPhase",
  );
  assert.ok(
    nightSkySrc.includes("BloodMoonRealm") &&
      nightSkySrc.includes("bloodMoonRealmMounted"),
    "NightSky.tsx must conditionally mount BloodMoonRealm",
  );
  assert.ok(
    nightSkySrc.includes("✦ 大肥鱼 · 星海漫游"),
    "NightSky.tsx whale bubble must show nameplate",
  );
  assert.ok(
    !nightSkySrc.includes("whalePhrase"),
    "NightSky.tsx should not append whalePhrase in sky bubble",
  );

  const bloodRealmPath = path.resolve(
    __dirname,
    "../src/components/nightSky/BloodMoonRealm.tsx",
  );
  assert.ok(fs.existsSync(bloodRealmPath), "Missing BloodMoonRealm.tsx");
  const bloodRealmSrc = fs.readFileSync(bloodRealmPath, "utf8");
  for (const required of [
    "night-blood-moon-bg.webp",
    "night-blood-moon-orb.webp",
    "night-blood-owl.webp",
    "BLOOD_MOON_QUOTES",
    "BLOOD ECLIPSE · 猩红夜幕",
    "破除血月 · 逃回现实",
    "cancelAnimation(",
    "clearTimeout(",
  ]) {
    assert.ok(
      bloodRealmSrc.includes(required),
      `BloodMoonRealm.tsx missing required piece: ${required}`,
    );
  }

  const primitivesSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/components/nightSky/NightSkyPrimitives.tsx"),
    "utf8",
  );
  assert.ok(
    primitivesSrc.includes("night-star-luminous.webp"),
    "NightSkyPrimitives.tsx must use night-star-luminous.webp",
  );
  assert.ok(
    !primitivesSrc.includes("rgba(255,231,171,0.34)") &&
      !primitivesSrc.includes("rgba(255,244,209,0.22)"),
    "NightSkyPrimitives.tsx must remove legacy gray-circle halo Views",
  );

  const effectsSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/components/nightSky/NightSkyEffects.tsx"),
    "utf8",
  );
  assert.ok(
    effectsSrc.includes("night-whale-cameo.webp"),
    "NightSkyEffects.tsx must use night-whale-cameo.webp",
  );
  assert.ok(
    !effectsSrc.includes("avatar-sheet.png") &&
      !effectsSrc.includes("whaleHalo") &&
      !effectsSrc.includes("whaleInnerGlow"),
    "NightSkyEffects.tsx must not reuse avatar-sheet.png or circular halo styles",
  );

  for (const imgName of [
    "night-blood-moon-bg.webp",
    "night-blood-moon-orb.webp",
    "night-blood-owl.webp",
    "night-star-luminous.webp",
    "night-whale-cameo.webp",
  ]) {
    const imgPath = path.resolve(__dirname, "../assets/images", imgName);
    assert.ok(fs.existsSync(imgPath), `Missing WebP asset: assets/images/${imgName}`);
    assert.ok(fs.statSync(imgPath).size > 512, `Empty/corrupt WebP asset: ${imgName}`);
  }

  console.log(
    `NightSky checks passed: ${NIGHT_SKY_QUOTES.length} curated quotes, ${BLOOD_MOON_QUOTES.length} blood moon quotes, ${NIGHT_CONSTELLATIONS.length} constellations, moon phase math, blood moon anti-mistouch lock, chronicle migration & secret badges, wishes (${MAX_NIGHT_WISHES} cap), celestial calendar, meteor quips, schedule mood, whale cameo, Star-Dew bridge & 7-note C-major scale wiring.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

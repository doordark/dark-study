/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = require("./load-project-ts.cjs")();
const craft = load("src/utils/ambientCraft.ts");

// 1. Tap sequence gate
{
  let state = craft.INITIAL_TAP_SEQUENCE;
  let lastResult = null;
  for (let i = 0; i < 4; i++) {
    lastResult = craft.advanceTapSequence(state, 1000 + i * 300, {
      targetCount: 5,
      windowMs: 2400,
    });
    assert.equal(lastResult.triggered, false);
    assert.equal(lastResult.next.count, i + 1);
    state = lastResult.next;
  }
  const finalHit = craft.advanceTapSequence(state, 2200, {
    targetCount: 5,
    windowMs: 2400,
  });
  assert.equal(finalHit.triggered, true);
  assert.equal(finalHit.progress, 1);
  assert.equal(finalHit.next.count, 0);

  // Timeout resets cleanly
  const r1 = craft.advanceTapSequence(craft.INITIAL_TAP_SEQUENCE, 1000, {
    targetCount: 3,
    windowMs: 500,
  });
  const r2 = craft.advanceTapSequence(r1.next, 2000, {
    targetCount: 3,
    windowMs: 500,
  });
  assert.equal(r2.triggered, false);
  assert.equal(r2.next.count, 1);

  // Backward clock resets cleanly
  const rBack = craft.advanceTapSequence(r2.next, 1500, {
    targetCount: 3,
    windowMs: 500,
  });
  assert.equal(rBack.next.count, 1);

  // Immediate targetCount=1 triggers directly
  const rSingle = craft.advanceTapSequence(craft.INITIAL_TAP_SEQUENCE, 500, {
    targetCount: 1,
  });
  assert.equal(rSingle.triggered, true);
}

// 2. Sequencer & melody matching
{
  assert.equal(craft.CHIME_NOTES.length, 7);
  assert.ok(craft.CHIME_PRESETS.length >= 3);
  for (const preset of craft.CHIME_PRESETS) {
    assert.ok(preset.steps.length > 0);
    assert.ok(preset.tempoMs >= 200);
    for (const step of preset.steps) {
      assert.ok(step === null || (Number.isInteger(step) && step >= 0 && step <= 6));
    }
  }

  assert.equal(craft.clampNoteIndex(-5), 0);
  assert.equal(craft.clampNoteIndex(99), 6);
  assert.equal(craft.clampNoteIndex(Number.NaN), 0);

  let hist = [];
  for (const n of [5, 5, 0, 1, 2, 3, 4, 5, 6]) {
    hist = craft.appendNoteHistory(hist, n, 10);
  }
  const scaleHit = craft.matchChimeDiscovery(hist);
  assert.ok(scaleHit && scaleHit.id === "starlight_scale");

  const bellHit = craft.matchChimeDiscovery([1, 2, 0, 1, 4]);
  assert.ok(bellHit && bellHit.id === "campus_chime");

  const starHit = craft.matchChimeDiscovery([0, 0, 4, 4, 5, 5, 4]);
  assert.ok(starHit && starHit.id === "lullaby_star");

  assert.equal(craft.matchChimeDiscovery([6, 6, 6]), null);
  assert.equal(craft.matchChimeDiscovery([]), null);

  let tape = [];
  for (let i = 0; i < 12; i++) {
    tape = craft.appendTapeNote(tape, i % 7, 8);
  }
  assert.equal(tape.length, 8);
  assert.equal(craft.stepCursor(0, 4), 1);
  assert.equal(craft.stepCursor(3, 4), 0);
  assert.equal(craft.stepCursor(2, 0), 0);
}

// 3. Orb placement & breathing phases
{
  const initial = craft.createInitialFireflies(3);
  assert.equal(initial.length, 3);
  const snapshot = [...initial];

  // Tap coordinates clamp safely inside interior bounds
  const withExtremeTap = craft.spawnFirefly(initial, { x: -10, y: 10 });
  assert.equal(withExtremeTap.length, 4);
  assert.equal(initial.length, snapshot.length, "spawn must stay immutable");
  const added = withExtremeTap[3];
  assert.ok(added.x >= 0.22 && added.x <= 0.78);
  assert.ok(added.y >= 0.30 && added.y <= 0.80);

  // Cap at MAX_FIREFLIES
  let full = initial;
  for (let i = 0; i < 20; i++) {
    full = craft.spawnFirefly(full);
  }
  assert.equal(full.length, craft.MAX_FIREFLIES);
  assert.equal(craft.computeJarWarmth(0), 0);
  assert.equal(craft.computeJarWarmth(craft.MAX_FIREFLIES), 1);
  assert.equal(craft.computeJarWarmth(99), 1);

  const pInhale = craft.computeBreathPhase(2000);
  assert.equal(pInhale.stage, "inhale");
  assert.equal(pInhale.completedCycles, 0);
  assert.ok(pInhale.haloScale > 0.78 && pInhale.haloScale < 1.18);

  const pHold = craft.computeBreathPhase(4500);
  assert.equal(pHold.stage, "hold");
  assert.equal(pHold.haloScale, 1.18);

  const pExhale = craft.computeBreathPhase(9000);
  assert.equal(pExhale.stage, "exhale");
  assert.ok(pExhale.haloScale > 0.78 && pExhale.haloScale < 1.18);

  const pCycle2 = craft.computeBreathPhase(craft.BREATH_CYCLE_MS + 500);
  assert.equal(pCycle2.completedCycles, 1);
  assert.equal(pCycle2.stage, "inhale");

  const pNeg = craft.computeBreathPhase(-500);
  assert.equal(pNeg.stage, "inhale");
  assert.equal(pNeg.completedCycles, 0);

  assert.ok(craft.pickIdleKeepsake(0).length > 4);
  assert.equal(
    craft.pickIdleKeepsake(-1),
    craft.IDLE_KEEPSAKES[craft.IDLE_KEEPSAKES.length - 1],
  );
}

// 4. Fortune draw & seals
{
  const s1 = craft.advanceShakeCount(0);
  assert.deepEqual(s1, { count: 1, revealed: false, progress: 1 / 3 });
  const s2 = craft.advanceShakeCount(s1.count);
  assert.deepEqual(s2, { count: 2, revealed: false, progress: 2 / 3 });
  const s3 = craft.advanceShakeCount(s2.count);
  assert.deepEqual(s3, { count: 3, revealed: true, progress: 1 });

  const first = craft.pickCampusFortune(12345);
  assert.ok(first && first.poem.length === 2);
  const second = craft.pickCampusFortune(12345, first.id);
  assert.notEqual(second.id, first.id, "excludeId prevents immediate duplicate");

  assert.equal(craft.nextSealIndex(null), 0);
  assert.equal(craft.nextSealIndex(0), 1);
  assert.equal(craft.nextSealIndex(craft.FORTUNE_SEALS.length - 1), 0);

  const w0 = craft.resolveJourneyWhisper({ earnedCredits: 0, termCount: 0 });
  const w1 = craft.resolveJourneyWhisper({ earnedCredits: 24, termCount: 1 });
  const w2 = craft.resolveJourneyWhisper({ earnedCredits: 72, termCount: 4 });
  const w3 = craft.resolveJourneyWhisper({ earnedCredits: 132, termCount: 7 });
  assert.equal(new Set([w0, w1, w2, w3]).size, 4);
}

// 5. Verify all referenced SFX IDs exist in soundEffects.ts
{
  const sfxSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/services/soundEffects.ts"),
    "utf8",
  );
  const validSfx = new Set(
    [...sfxSrc.matchAll(/^\s*([a-z0-9_]+):\s*require\(/gm)].map((m) => m[1]),
  );
  const uiSrc = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AmbientCraft.tsx"),
    "utf8",
  );
  const usedIds = [...uiSrc.matchAll(/playSfx\(\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  assert.ok(usedIds.length > 0);
  for (const id of usedIds) {
    assert.ok(validSfx.has(id), `Unknown SFX id referenced: ${id}`);
  }
}

console.log("PASS: ambient craft helpers and asset references verified.");

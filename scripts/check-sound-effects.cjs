// Deterministic verification of all 49 easter egg, farm & DaFeiYu SFX assets, total size budget (< 1 MB),
// mute toggle, cooldown throttling, pitch-rise math, C-major star scale, and DaFeiYu cute SFX mood mapping.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sfxDir = path.resolve(__dirname, "../assets/sfx");
const load = require("./load-project-ts.cjs");

const EXPECTED_IDS = [
  "farm_plant",
  "farm_water",
  "farm_refill",
  "farm_fertilize",
  "farm_harvest",
  "farm_coin",
  "farm_cook",
  "farm_gift",
  "farm_level_up",
  "farm_door",
  "farm_sleep",
  "farm_chicken",
  "farm_festival",
  "farm_event",
  "fish_cast",
  "fish_bite",
  "fish_catch",
  "fish_miss",
  "bug_catch",
  "horror_appear",
  "horror_banish",
  "star_charge",
  "star_note_1",
  "star_note_2",
  "star_note_3",
  "star_note_4",
  "star_note_5",
  "star_note_6",
  "star_note_7",
  "star_constellation",
  "owl_hoot",
  "after_star_flip",
  "after_coffee_stir",
  "after_stamp",
  "zero_g",
  "whale_summon",
  "whale_leave",
  "whale_dock_boop",
  "whale_ui_ripple",
  "whale_popover_open",
  "whale_popover_close",
  "whale_pet_summon",
  "whale_pet_dismiss",
  "whale_chat_send",
  "whale_cute_happy",
  "whale_cute_tsun",
  "whale_cute_sleepy",
  "whale_cute_comfort",
  "whale_cute_excited",
];

function checkAssetFiles() {
  let totalBytes = 0;
  for (const id of EXPECTED_IDS) {
    const file = path.join(sfxDir, `${id}.mp3`);
    assert(fs.existsSync(file), `Missing SFX asset: ${file}`);
    const buf = fs.readFileSync(file);
    assert(buf.length >= 1024, `SFX asset unexpectedly tiny: ${id} (${buf.length} B)`);
    const validHeader =
      (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
      (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    assert(validHeader, `SFX asset lacks valid MP3/ID3 header: ${id}`);
    totalBytes += buf.length;
  }
  assert(
    totalBytes < 1024 * 1024,
    `Total SFX bundle must stay under 1 MB (got ${(totalBytes / 1024).toFixed(1)} KB)`,
  );
  return totalBytes;
}

async function main() {
  const totalBytes = checkAssetFiles();

  const played = [];
  const removed = [];
  const sfxStore = { on: true, loaded: true, hydrate: async () => {} };
  const appState = { currentState: "active" };

  const mocks = {
    "react-native": { AppState: appState },
    "@/store/useSoundEffects": { useSoundEffects: { getState: () => sfxStore } },
    "expo-audio": {
      setAudioModeAsync: async () => {},
      createAudioPlayer: (source) => {
        const listeners = [];
        const player = {
          volume: 1,
          shouldCorrectPitch: true,
          playbackRate: 1,
          setPlaybackRate(r) {
            this.playbackRate = r;
          },
          addListener: (_ev, fn) => {
            listeners.push(fn);
            return { remove: () => {} };
          },
          play: () => {
            played.push({ source, volume: player.volume, rate: player.playbackRate });
          },
          pause: () => {},
          remove: () => removed.push(source),
        };
        return player;
      },
    },
  };
  for (const id of EXPECTED_IDS) {
    mocks[`../../assets/sfx/${id}.mp3`] = id;
  }

  const sfx = load(mocks)("src/services/soundEffects.ts");

  assert.equal(Object.keys(sfx.SFX_ASSETS).length, EXPECTED_IDS.length);
  for (const key of [
    "whale_dock_boop",
    "whale_ui_ripple",
    "whale_popover_open",
    "whale_popover_close",
    "whale_pet_summon",
    "whale_pet_dismiss",
    "whale_chat_send",
  ]) {
    assert.equal(sfx.SFX_ASSETS[key], key, `Missing expected DaFeiYu SFX export: ${key}`);
  }
  assert.equal(sfx.resolveWhaleCuteSfx("normal", "哼，才不是想你呢！"), "whale_cute_tsun");
  assert.equal(sfx.resolveWhaleCuteSfx("sleepy", "晚安呼呼"), "whale_cute_sleepy");
  assert.equal(sfx.resolveWhaleCuteSfx("comfort", "没关系呀"), "whale_cute_comfort");
  assert.equal(sfx.resolveWhaleCuteSfx("excited", "耶！冲呀！"), "whale_cute_excited");
  assert.equal(sfx.resolveWhaleCuteSfx("happy", "嘿嘿喜欢你"), "whale_cute_happy");

  assert(sfx.risingRate(3) > sfx.risingRate(0));
  assert.equal(sfx.STAR_SCALE_SFX.length, 7);
  assert.equal(sfx.resolveStarScaleSfx(-2), "star_note_1");
  assert.equal(sfx.resolveStarScaleSfx(0), "star_note_1");
  assert.equal(sfx.resolveStarScaleSfx(3), "star_note_4");
  assert.equal(sfx.resolveStarScaleSfx(6), "star_note_7");
  assert.equal(sfx.resolveStarScaleSfx(99), "star_note_7");
  assert.equal(sfx.resolveStarScaleSfx(Number.NaN), "star_note_1");

  // Rapid 7-star scale taps play consecutive notes without cooldown blocking
  for (let step = 0; step < 7; step++) {
    assert.equal(sfx.playStarScaleNote(step), `star_note_${step + 1}`);
  }
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(
    played.slice(0, 7).map((item) => item.source),
    ["star_note_1", "star_note_2", "star_note_3", "star_note_4", "star_note_5", "star_note_6", "star_note_7"],
  );
  played.length = 0;

  sfx.playSfx("farm_harvest", { rate: 1.12 });
  // Cooldown blocks immediate duplicate within 45ms
  sfx.playSfx("farm_harvest");
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(played.length, 1);
  assert.equal(played[0].source, "farm_harvest");
  assert.equal(played[0].rate, 1.12);

  // Mute toggle blocks normal SFX, but allows bypassToggle (for whale voice cute_sfx mode)
  sfxStore.on = false;
  sfx.playSfx("farm_coin", { ignoreCooldown: true });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(played.length, 1);

  sfx.playWhaleCuteSfx("happy", "白米饭", { ignoreCooldown: true, bypassToggle: true });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(played.length, 2);
  assert.equal(played[1].source, "whale_cute_tsun");

  sfx.stopAllSfx();
  assert(removed.length >= 2, "stopAllSfx disposes active AudioPlayer handles");

  console.log(
    `PASS: ${EXPECTED_IDS.length} SFX assets verified (${(totalBytes / 1024).toFixed(1)} KB total), cooldown, mute, bypass, pitch-rise & whale cute mood checks passed.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

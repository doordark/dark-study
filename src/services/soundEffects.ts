import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from "expo-audio";
import { AppState } from "react-native";
import { useSoundEffects } from "@/store/useSoundEffects";
import type { Mood } from "@/services/whaleVoiceText";

export const SFX_ASSETS = {
  // Farm core farming & life
  farm_plant: require("../../assets/sfx/farm_plant.mp3"),
  farm_water: require("../../assets/sfx/farm_water.mp3"),
  farm_refill: require("../../assets/sfx/farm_refill.mp3"),
  farm_fertilize: require("../../assets/sfx/farm_fertilize.mp3"),
  farm_harvest: require("../../assets/sfx/farm_harvest.mp3"),
  farm_coin: require("../../assets/sfx/farm_coin.mp3"),
  farm_cook: require("../../assets/sfx/farm_cook.mp3"),
  farm_gift: require("../../assets/sfx/farm_gift.mp3"),
  farm_level_up: require("../../assets/sfx/farm_level_up.mp3"),
  farm_door: require("../../assets/sfx/farm_door.mp3"),
  farm_sleep: require("../../assets/sfx/farm_sleep.mp3"),
  farm_chicken: require("../../assets/sfx/farm_chicken.mp3"),
  farm_festival: require("../../assets/sfx/farm_festival.mp3"),
  farm_event: require("../../assets/sfx/farm_event.mp3"),

  // Farm minigames & night horror easter egg
  fish_cast: require("../../assets/sfx/fish_cast.mp3"),
  fish_bite: require("../../assets/sfx/fish_bite.mp3"),
  fish_catch: require("../../assets/sfx/fish_catch.mp3"),
  fish_miss: require("../../assets/sfx/fish_miss.mp3"),
  bug_catch: require("../../assets/sfx/bug_catch.mp3"),
  horror_appear: require("../../assets/sfx/horror_appear.mp3"),
  horror_banish: require("../../assets/sfx/horror_banish.mp3"),

  // Hidden schedule & sky easter eggs
  star_charge: require("../../assets/sfx/star_charge.mp3"),
  star_note_1: require("../../assets/sfx/star_note_1.mp3"),
  star_note_2: require("../../assets/sfx/star_note_2.mp3"),
  star_note_3: require("../../assets/sfx/star_note_3.mp3"),
  star_note_4: require("../../assets/sfx/star_note_4.mp3"),
  star_note_5: require("../../assets/sfx/star_note_5.mp3"),
  star_note_6: require("../../assets/sfx/star_note_6.mp3"),
  star_note_7: require("../../assets/sfx/star_note_7.mp3"),
  star_constellation: require("../../assets/sfx/star_constellation.mp3"),
  owl_hoot: require("../../assets/sfx/owl_hoot.mp3"),
  after_star_flip: require("../../assets/sfx/after_star_flip.mp3"),
  after_coffee_stir: require("../../assets/sfx/after_coffee_stir.mp3"),
  after_stamp: require("../../assets/sfx/after_stamp.mp3"),
  zero_g: require("../../assets/sfx/zero_g.mp3"),

  // DaFeiYu summon, UI wave, popover, dock boop & cute mascot reaction chirps
  whale_summon: require("../../assets/sfx/whale_summon.mp3"),
  whale_leave: require("../../assets/sfx/whale_leave.mp3"),
  whale_dock_boop: require("../../assets/sfx/whale_dock_boop.mp3"),
  whale_ui_ripple: require("../../assets/sfx/whale_ui_ripple.mp3"),
  whale_popover_open: require("../../assets/sfx/whale_popover_open.mp3"),
  whale_popover_close: require("../../assets/sfx/whale_popover_close.mp3"),
  whale_pet_summon: require("../../assets/sfx/whale_pet_summon.mp3"),
  whale_pet_dismiss: require("../../assets/sfx/whale_pet_dismiss.mp3"),
  whale_chat_send: require("../../assets/sfx/whale_chat_send.mp3"),
  whale_cute_happy: require("../../assets/sfx/whale_cute_happy.mp3"),
  whale_cute_tsun: require("../../assets/sfx/whale_cute_tsun.mp3"),
  whale_cute_sleepy: require("../../assets/sfx/whale_cute_sleepy.mp3"),
  whale_cute_comfort: require("../../assets/sfx/whale_cute_comfort.mp3"),
  whale_cute_excited: require("../../assets/sfx/whale_cute_excited.mp3"),
} as const satisfies Record<string, AudioSource>;

export type SfxId = keyof typeof SFX_ASSETS;

export interface PlaySfxOptions {
  /** 0.0 ~ 1.0，默认 0.72 */
  volume?: number;
  /** 变速微调音高（0.65 ~ 1.65），用于集星/抓虫连击升调 */
  rate?: number;
  /** 同类音效忽略 45ms 防抖冷却 */
  ignoreCooldown?: boolean;
  /** 跳过彩蛋音效总开关（供大肥鱼语音软萌拟声模式使用） */
  bypassToggle?: boolean;
}

const MAX_ACTIVE_PLAYERS = 4;
const MAX_COOLDOWN_ENTRIES = 32;
const COOLDOWN_MS = 160;
const COOLDOWN_TTL_MS = COOLDOWN_MS * 4;
const GLOBAL_COOLDOWN_MS = 90;
const SAFETY_TIMEOUT_MS = 4000;

interface ActiveHandle {
  player: AudioPlayer;
  cleanup: () => void;
}

const activeHandles = new Set<ActiveHandle>();
const lastPlayedAt = new Map<SfxId, number>();
let lastGlobalPlayedAt = 0;
let playGeneration = 0;
let audioModeReady: Promise<void> | null = null;

function pruneLastPlayedAt(now: number) {
  for (const [key, ts] of lastPlayedAt) {
    if (now - ts >= COOLDOWN_TTL_MS || ts > now) {
      lastPlayedAt.delete(key);
    }
  }
  while (lastPlayedAt.size >= MAX_COOLDOWN_ENTRIES) {
    const oldest = lastPlayedAt.keys().next().value;
    if (!oldest) break;
    lastPlayedAt.delete(oldest);
  }
}

function ensureAudioMode() {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      playsInSilentMode: false,
    }).catch(() => {
      audioModeReady = null;
    });
  }
  return audioModeReady;
}

function disposeHandle(handle: ActiveHandle) {
  if (!activeHandles.has(handle)) return;
  activeHandles.delete(handle);
  handle.cleanup();
}

export function releaseSfxMemory() {
  lastPlayedAt.clear();
  lastGlobalPlayedAt = 0;
}

export function stopAllSfx() {
  playGeneration += 1;
  for (const handle of [...activeHandles]) {
    disposeHandle(handle);
  }
  releaseSfxMemory();
}

export function playSfx(id: SfxId, opts: PlaySfxOptions = {}): void {
  if (AppState.currentState === "background" || AppState.currentState === "inactive") return;
  if (!opts.bypassToggle) {
    const store = useSoundEffects.getState();
    if (!store.loaded) void store.hydrate();
    if (!store.on) return;
  }

  const now = Date.now();
  if (!opts.ignoreCooldown) {
    const prev = lastPlayedAt.get(id) ?? 0;
    if (now - prev < COOLDOWN_MS) return;
    if (now - lastGlobalPlayedAt < GLOBAL_COOLDOWN_MS) return;
    lastGlobalPlayedAt = now;
  }
  if (lastPlayedAt.size >= MAX_COOLDOWN_ENTRIES) {
    pruneLastPlayedAt(now);
  }
  if (lastPlayedAt.has(id)) {
    lastPlayedAt.delete(id);
  }
  lastPlayedAt.set(id, now);

  const gen = playGeneration;
  void ensureAudioMode().then(() => {
    if (gen !== playGeneration) return;
    if (AppState.currentState === "background" || AppState.currentState === "inactive") return;
    if (!opts.bypassToggle && !useSoundEffects.getState().on) return;

    try {
      while (activeHandles.size >= MAX_ACTIVE_PLAYERS) {
        const oldest = activeHandles.values().next().value;
        if (!oldest) break;
        disposeHandle(oldest);
      }

      const player = createAudioPlayer(SFX_ASSETS[id], {
        updateInterval: 80,
        keepAudioSessionActive: false,
      });

      const vol = opts.volume ?? 0.58;
      player.volume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.58));

      if (opts.rate && Number.isFinite(opts.rate) && Math.abs(opts.rate - 1) > 0.01) {
        const clampedRate = Math.max(0.65, Math.min(1.65, opts.rate));
        try {
          player.shouldCorrectPitch = false;
          player.setPlaybackRate(clampedRate);
        } catch {
          // Some web browsers or codecs ignore pitch-uncorrected playback rate.
        }
      }

      let finished = false;
      let subscription: { remove(): void } | undefined;
      const timer = setTimeout(() => disposeHandle(handle), SAFETY_TIMEOUT_MS);

      const handle: ActiveHandle = {
        player,
        cleanup: () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          try {
            subscription?.remove();
          } catch {}
          try {
            player.pause();
          } catch {}
          try {
            player.remove();
          } catch {}
        },
      };

      activeHandles.add(handle);
      try {
        subscription = player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish || status.error) {
            disposeHandle(handle);
          }
        });
        player.play();
      } catch {
        disposeHandle(handle);
      }
    } catch {
      // Sound effects must never interrupt gameplay or UI interactions.
    }
  });
}

const TSUNDERE_RE = /哼|才不是|笨蛋|白饭|白米饭|不胖|才没有|少管我|气鼓鼓|大爹/;

/** 根据台词与情绪挑选最契合大肥鱼人设（软萌/傲娇/奶凶/困倦/温柔）的内置短音效 */
export function resolveWhaleCuteSfx(mood: Mood, text = ""): SfxId {
  if (mood === "sleepy") return "whale_cute_sleepy";
  if (mood === "comfort") return "whale_cute_comfort";
  if (mood === "excited") return "whale_cute_excited";
  if (TSUNDERE_RE.test(text)) return "whale_cute_tsun";
  return "whale_cute_happy";
}

export function playWhaleCuteSfx(
  mood: Mood,
  text = "",
  opts: Omit<PlaySfxOptions, "rate"> = {},
): SfxId {
  const id = resolveWhaleCuteSfx(mood, text);
  playSfx(id, { volume: 0.76, ...opts });
  return id;
}

/** 升调工具：用于抓虫连击等非音阶场景 */
export function risingRate(stepIndex: number, stepSpan = 0.065, base = 0.94, max = 1.48): number {
  const idx = Math.max(0, Math.floor(stepIndex));
  return Math.min(max, base + idx * stepSpan);
}

/** C 大调完整七声音阶（Do Re Mi Fa Sol La Si），供星空拾星与秘密充能依次弹奏 */
export const STAR_SCALE_SFX = [
  "star_note_1",
  "star_note_2",
  "star_note_3",
  "star_note_4",
  "star_note_5",
  "star_note_6",
  "star_note_7",
] as const satisfies readonly SfxId[];

export function resolveStarScaleSfx(stepIndex: number): SfxId {
  const safe = Number.isFinite(stepIndex) ? Math.floor(stepIndex) : 0;
  const clamped = Math.max(0, Math.min(STAR_SCALE_SFX.length - 1, safe));
  return STAR_SCALE_SFX[clamped];
}

export function playStarScaleNote(
  stepIndex: number,
  opts: Omit<PlaySfxOptions, "rate"> = {},
): SfxId {
  const id = resolveStarScaleSfx(stepIndex);
  playSfx(id, { volume: 0.72, ignoreCooldown: true, ...opts });
  return id;
}

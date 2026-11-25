import { AppState, Platform } from "react-native";
import { useWhaleVoice, type WhaleVoiceConfig, type WhaleVoiceEngine } from "@/store/useWhaleVoice";
import { playWhaleCuteSfx } from "./soundEffects";
import { whaleAudioPlayer } from "./whaleAudioPlayer";
import { speakSystem, stopSystemVoice } from "./whaleSystemVoice";
import {
  synthesizeBreezeBlue,
  synthesizeEdgeTts,
  synthesizeSiliconFlow,
  TtsProviderError,
} from "./whaleTtsProviders";
import {
  getCachedVoice,
  putCachedVoice,
  releaseVoiceUri,
  voiceCacheIdentity,
} from "./whaleVoiceCache";
import { getTtsApiKey } from "./whaleVoiceCredentials";
import { detectMood, offlinePhrases, voiceSpeakable, type Mood } from "./whaleVoiceText";

export { toSpeakable } from "./whaleVoiceText";
export type { Mood } from "./whaleVoiceText";

export type VoiceEngineResult =
  | "breezeblue"
  | "siliconflow"
  | "edge"
  | "cute_sfx"
  | "system"
  | "silent"
  | "cancelled";

export type VoiceResult = {
  engine: VoiceEngineResult;
  cached?: boolean;
  error?: string;
};

export interface SpeakWhaleOptions {
  /** 跳过总开关检查（供设置页试听按钮使用） */
  force?: boolean;
  /** 强制指定本次测试的引擎 */
  engineOverride?: WhaleVoiceEngine;
}

let token = 0;
let activeAbort: AbortController | null = null;
let stopped: Promise<void> = Promise.resolve();

const isCurrent = (id: number, force = false) =>
  id === token &&
  (force || useWhaleVoice.getState().on) &&
  AppState.currentState !== "background" &&
  AppState.currentState !== "inactive";

export function stopWhaleVoice() {
  token++;
  activeAbort?.abort();
  activeAbort = null;
  whaleAudioPlayer.stop();
  stopped = stopped.then(stopSystemVoice).catch(() => {});
}

export function disposeWhaleVoice() {
  stopWhaleVoice();
  whaleAudioPlayer.dispose();
}

type CloudEngine = "breezeblue" | "siliconflow" | "edge";

interface ResolvedCloudPlan {
  provider: CloudEngine;
  voiceId: string;
  apiKey?: string;
}

async function resolveCloudPlans(
  mode: WhaleVoiceEngine,
  config: WhaleVoiceConfig,
): Promise<{ plans: ResolvedCloudPlan[]; hintError?: string }> {
  if (mode === "cute_sfx" || mode === "system") return { plans: [] };

  const plans: ResolvedCloudPlan[] = [];
  const tryBreeze = async () => {
    const key = await getTtsApiKey("breezeblue");
    if (key && config.breezeVoiceId.trim()) {
      plans.push({ provider: "breezeblue", voiceId: config.breezeVoiceId.trim(), apiKey: key });
      return true;
    }
    return false;
  };
  const trySilicon = async () => {
    const key = await getTtsApiKey("siliconflow");
    if (key) {
      plans.push({ provider: "siliconflow", voiceId: config.siliconVoice.trim(), apiKey: key });
      return true;
    }
    return false;
  };
  const tryEdge = () => {
    if (Platform.OS !== "web") {
      plans.push({ provider: "edge", voiceId: config.edgeVoice });
      return true;
    }
    return false;
  };

  if (mode === "breezeblue") {
    const ok = await tryBreeze();
    return {
      plans,
      hintError: ok ? undefined : "未填写 BreezeBlue API Key 或音色 ID",
    };
  }
  if (mode === "siliconflow") {
    const ok = await trySilicon();
    return {
      plans,
      hintError: ok ? undefined : "未填写硅基流动 API Key",
    };
  }
  if (mode === "edge") {
    const ok = tryEdge();
    return {
      plans,
      hintError: ok ? undefined : "Web 端无法直连 Edge TTS，请切换云端语音或软萌拟声",
    };
  }

  // auto: prioritize user-configured high-quality cloud voice, then key-free Edge少女音.
  await tryBreeze();
  await trySilicon();
  tryEdge();
  return { plans };
}

async function synthesizePhrase(
  plan: ResolvedCloudPlan,
  phrase: string,
  mood: Mood,
  signal: AbortSignal,
): Promise<{ uri: string; cached: boolean }> {
  const identity = voiceCacheIdentity(plan.provider, plan.voiceId, mood, phrase);
  const hit = await getCachedVoice(identity);
  if (hit) return { uri: hit, cached: true };

  let bytes: Uint8Array;
  if (plan.provider === "breezeblue") {
    bytes = await synthesizeBreezeBlue({
      text: phrase,
      voiceId: plan.voiceId,
      apiKey: plan.apiKey ?? "",
      signal,
    });
  } else if (plan.provider === "siliconflow") {
    bytes = await synthesizeSiliconFlow({
      text: phrase,
      voice: plan.voiceId,
      apiKey: plan.apiKey ?? "",
      mood,
      signal,
    });
  } else {
    bytes = await synthesizeEdgeTts({
      text: phrase,
      voice: plan.voiceId as WhaleVoiceConfig["edgeVoice"],
      mood,
      signal,
    });
  }

  const uri = await putCachedVoice(identity, bytes);
  return { uri, cached: false };
}

async function playCloudPlan(
  plan: ResolvedCloudPlan,
  phrases: string[],
  mood: Mood,
  id: number,
  force: boolean,
  signal: AbortSignal,
): Promise<{ ok: boolean; cached: boolean; error?: string }> {
  let allCached = true;
  let nextPromise: Promise<{ uri: string; cached: boolean }> | null = null;

  try {
    for (let i = 0; i < phrases.length; i++) {
      if (!isCurrent(id, force) || signal.aborted) return { ok: false, cached: false };

      const currentTask = nextPromise ?? synthesizePhrase(plan, phrases[i], mood, signal);
      nextPromise = null;

      const { uri, cached } = await currentTask;
      if (!cached) allCached = false;

      if (!isCurrent(id, force) || signal.aborted) {
        releaseVoiceUri(uri);
        return { ok: false, cached: false };
      }

      // Pipeline next phrase while current audio is playing to minimize gaps.
      if (i + 1 < phrases.length) {
        nextPromise = synthesizePhrase(plan, phrases[i + 1], mood, signal);
        nextPromise.catch(() => {});
      }

      try {
        await whaleAudioPlayer.play(uri, signal);
      } finally {
        releaseVoiceUri(uri);
      }
    }
    return { ok: true, cached: allCached };
  } catch (err) {
    const message =
      err instanceof TtsProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "语音合成失败";
    return { ok: false, cached: false, error: message };
  } finally {
    if (nextPromise) {
      void nextPromise.then(({ uri }) => releaseVoiceUri(uri)).catch(() => {});
      nextPromise = null;
    }
  }
}

export async function speakWhale(
  text: string,
  opts: SpeakWhaleOptions = {},
): Promise<VoiceResult> {
  const force = opts.force === true;
  stopWhaleVoice();
  const id = token;
  const controller = new AbortController();
  activeAbort = controller;

  await useWhaleVoice.getState().hydrate();
  await stopped;
  if (!isCurrent(id, force)) return { engine: "cancelled" };

  const clean = voiceSpeakable(text);
  if (!clean) return { engine: "silent" };

  const mood = detectMood(clean);
  const config = useWhaleVoice.getState().config;
  const mode = opts.engineOverride ?? config.engine;

  if (mode === "cute_sfx") {
    playWhaleCuteSfx(mood, clean, { ignoreCooldown: true, bypassToggle: true });
    return { engine: "cute_sfx" };
  }

  if (mode === "system") {
    try {
      speakSystem(clean, mood, id, (checkId) => isCurrent(checkId, force));
      return { engine: "system" };
    } catch {
      return { engine: "silent" };
    }
  }

  const { plans, hintError } = await resolveCloudPlans(mode, config);
  if (!isCurrent(id, force)) return { engine: "cancelled" };

  const phrases = offlinePhrases(clean);
  let lastError = hintError;

  for (const plan of plans) {
    if (!isCurrent(id, force)) return { engine: "cancelled" };
    const result = await playCloudPlan(plan, phrases, mood, id, force, controller.signal);
    if (!isCurrent(id, force)) return { engine: "cancelled" };
    if (result.ok) {
      return { engine: plan.provider, cached: result.cached };
    }
    if (result.error) lastError = result.error;
  }

  // Fallback: prefer built-in cute whale chirp over robotic system TTS unless user opts in.
  if (config.fallbackToSystem) {
    try {
      speakSystem(clean, mood, id, (checkId) => isCurrent(checkId, force));
      return { engine: "system", error: lastError };
    } catch {
      return { engine: "silent", error: lastError };
    }
  }

  playWhaleCuteSfx(mood, clean, { ignoreCooldown: true, bypassToggle: true });
  return { engine: "cute_sfx", error: lastError };
}

export const WHALE_VOICE_PREVIEW_LINE = "哼，才不是特意为了让你听声音才开口的呢，大爹记得好好休息呀～";

export function previewWhaleVoice(sampleText = WHALE_VOICE_PREVIEW_LINE): Promise<VoiceResult> {
  return speakWhale(sampleText, { force: true });
}

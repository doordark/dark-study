import { AppState } from "react-native";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { generateFishSpeech, FishAudioError } from "./fishAudio";
import { getFishApiKey } from "./whaleVoiceCredentials";
import { getCachedVoice, putCachedVoice, releaseVoiceUri, voiceCacheIdentity } from "./whaleVoiceCache";
import { whaleAudioPlayer } from "./whaleAudioPlayer";
import { speakSystem, stopSystemVoice } from "./whaleSystemVoice";
import { detectMood, fishSpeakable, type Mood } from "./whaleVoiceText";
export { toSpeakable } from "./whaleVoiceText";
export type { Mood } from "./whaleVoiceText";

let token = 0;
let active: AbortController | null = null;
let systemStopped: Promise<void> = Promise.resolve();
export type VoiceResult = { engine: "fish" | "cache" | "system" | "silent" | "cancelled"; error?: string };
interface VoiceOptions { mood?: Mood; forceSystem?: boolean; preview?: boolean }

function current(my: number) {
  return my === token && useWhaleVoice.getState().on &&
    AppState.currentState !== "background" && AppState.currentState !== "inactive";
}

export function stopWhaleVoice() {
  token += 1;
  active?.abort();
  active = null;
  whaleAudioPlayer.stop();
  // Await native system stop before any new utterance, including rapid A/B calls.
  systemStopped = systemStopped.then(stopSystemVoice).catch(() => {});
}

export function disposeWhaleVoice() { stopWhaleVoice(); whaleAudioPlayer.dispose(); }

/** Same entry point for chat, pet and previews; sound errors never reject to UI. */
export async function speakWhale(text: string, options: VoiceOptions = {}): Promise<VoiceResult> {
  stopWhaleVoice();
  const my = token;
  const controller = new AbortController();
  active = controller;
  const started = Date.now();
  const timing = (stage: string, extra?: number) => {
    if (__DEV__) console.debug("[WhaleVoice]", stage, `${Date.now() - started}ms`, extra ?? "");
  };
  const clean = fishSpeakable(text);
  const mood = options.mood ?? detectMood(clean);
  let fishError: string | undefined;
  let uri: string | null = null;
  try {
    await useWhaleVoice.getState().hydrate();
    await systemStopped;
    if (!current(my)) return { engine: "cancelled" };
    if (!clean) return { engine: "silent" };
    const settings = useWhaleVoice.getState();
    if (!options.forceSystem && (settings.engine !== "system" || options.preview)) {
      try {
        if (!settings.referenceId) throw new FishAudioError("请先填写并保存 Fish Voice ID");
        const identity = voiceCacheIdentity(clean, mood, settings.referenceId);
        // Preview bypasses cache so changed/invalid keys are actually validated.
        if (!options.preview) uri = await getCachedVoice(identity).catch(() => null);
        if (!current(my)) return { engine: "cancelled" };
        const hit = !!uri;
        if (!uri) {
          const key = await getFishApiKey();
          if (!current(my)) return { engine: "cancelled" };
          if (!key) throw new FishAudioError("未配置 Fish API Key，已使用系统语音");
          timing("request start");
          const bytes = await generateFishSpeech({ text: clean, mood, referenceId: settings.referenceId, apiKey: key, signal: controller.signal });
          if (!current(my)) return { engine: "cancelled" };
          timing("response received", bytes.length);
          uri = await putCachedVoice(identity, bytes);
          if (!current(my)) return { engine: "cancelled" };
          timing("file cached", bytes.length);
        } else timing("cache hit");
        await whaleAudioPlayer.play(uri, controller.signal, () => timing(hit ? "cache playback started" : "playback started"));
        if (!current(my)) return { engine: "cancelled" };
        return { engine: hit ? "cache" : "fish" };
      } catch (error) {
        if (!current(my)) return { engine: "cancelled" };
        whaleAudioPlayer.stop();
        fishError = error instanceof FishAudioError ? error.message : "自然语音播放或缓存失败，已使用系统语音";
        if (__DEV__) console.warn("[WhaleVoice]", fishError);
      }
    }
    if (!current(my)) return { engine: "cancelled" };
    speakSystem(clean, mood, my, current);
    return { engine: "system", error: fishError };
  } catch {
    if (current(my) && clean) {
      try { speakSystem(clean, mood, my, current); return { engine: "system", error: "自然语音不可用，已使用系统语音" }; } catch {}
    }
    return { engine: current(my) ? "silent" : "cancelled" };
  } finally {
    if (uri) releaseVoiceUri(uri);
    if (active === controller) active = null;
  }
}

import { AppState } from "react-native";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { generateOfflineSpeech, disposeOfflineVoice, warmWhaleVoice } from "./whaleOfflineVoice";
import { VOICE_ID } from "./whaleVoiceProfile";
import { getCachedVoice, putCachedVoice, releaseVoiceUri, voiceCacheIdentity } from "./whaleVoiceCache";
import { whaleAudioPlayer } from "./whaleAudioPlayer";
import { speakSystem, stopSystemVoice } from "./whaleSystemVoice";
import { detectMood, voiceSpeakable, offlinePhrases } from "./whaleVoiceText";
export { toSpeakable } from "./whaleVoiceText";
export { warmWhaleVoice };
export type { Mood } from "./whaleVoiceText";

let token = 0;
let active: AbortController | null = null;
let systemStopped: Promise<void> = Promise.resolve();
export type VoiceResult = { engine: "offline" | "cache" | "system" | "silent" | "cancelled"; error?: string };

function current(my: number) {
  return my === token && useWhaleVoice.getState().on &&
    AppState.currentState !== "background" && AppState.currentState !== "inactive";
}

export function stopWhaleVoice() {
  token += 1;
  active?.abort();
  active = null;
  whaleAudioPlayer.stop();
  systemStopped = systemStopped.then(stopSystemVoice).catch(() => {});
}

export function disposeWhaleVoice() {
  stopWhaleVoice();
  whaleAudioPlayer.dispose();
  disposeOfflineVoice();
}

/** Shared chat/pet channel. Prepare the next phrase while the current phrase plays. */
export async function speakWhale(text: string): Promise<VoiceResult> {
  stopWhaleVoice();
  const my = token;
  const controller = new AbortController();
  active = controller;
  const clean = voiceSpeakable(text);
  const mood = detectMood(clean);
  const phrases = offlinePhrases(clean);
  let position = 0;
  let uri: string | null = null;
  type Prepared = { uri: string; hit: boolean } | { error: unknown };
  let pending: Promise<Prepared> | undefined;
  const prepare = async (phrase: string): Promise<Prepared> => {
    try {
      if (!current(my) || controller.signal.aborted) throw new Error("Cancelled");
      const identity = voiceCacheIdentity(phrase, mood, VOICE_ID);
      let file = await getCachedVoice(identity).catch(() => null);
      const hit = !!file;
      if (!current(my) || controller.signal.aborted) throw new Error("Cancelled");
      if (!file) {
        const bytes = await generateOfflineSpeech(phrase, mood, controller.signal);
        if (!current(my) || controller.signal.aborted) throw new Error("Cancelled");
        file = await putCachedVoice(identity, bytes);
      }
      return { uri: file, hit };
    } catch (error) { return { error }; }
  };
  try {
    await useWhaleVoice.getState().hydrate();
    await systemStopped;
    if (!current(my)) return { engine: "cancelled" };
    if (!clean) return { engine: "silent" };
    let allCached = true;
    pending = prepare(phrases[0]);
    for (; position < phrases.length; position++) {
      const prepared: Prepared = await pending!;
      pending = undefined;
      if ("error" in prepared) throw prepared.error;
      uri = prepared.uri;
      if (!current(my)) return { engine: "cancelled" };
      allCached = allCached && prepared.hit;
      if (position + 1 < phrases.length) pending = prepare(phrases[position + 1]);
      await whaleAudioPlayer.play(uri, controller.signal, () => {});
      releaseVoiceUri(uri);
      uri = null;
      if (!current(my)) return { engine: "cancelled" };
    }
    return { engine: allCached ? "cache" : "offline" };
  } catch {
    if (!current(my)) return { engine: "cancelled" };
    controller.abort();
    whaleAudioPlayer.stop();
    // Expo Go / unsupported platforms still speak; do not repeat completed phrases.
    try {
      speakSystem(phrases.slice(position).join(""), mood, my, current);
      return { engine: "system", error: "内置语音不可用，已使用系统语音" };
    } catch { return { engine: "silent" }; }
  } finally {
    if (uri) releaseVoiceUri(uri);
    if (pending) void pending.then((result) => { if ("uri" in result) releaseVoiceUri(result.uri); });
    if (active === controller) active = null;
  }
}

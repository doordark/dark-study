import type { Mood } from "./whaleVoiceText";
export function warmWhaleVoice() {}
export function disposeOfflineVoice() {}
export async function generateOfflineSpeech(_text: string, _mood: Mood, _signal: AbortSignal): Promise<Uint8Array> {
  throw new Error("Bundled voice requires the native app");
}

import type { Mood } from "./whaleVoiceText";

export const FISH_MODEL = "s2.1-pro-free";
export const FISH_ENDPOINT = "https://api.fish.audio/v1/tts";
export const VOICE_PROFILE_VERSION = 1;
export const FISH_TIMEOUT_MS = 12_000;

// S2 bracket cues, from Fish's official Emotion Control reference.
// Only these application-owned cues can reach the TTS control channel.
const DIRECTIONS: Record<Mood, string> = {
  tender: "[relaxed][soft tone]",
  happy: "[happy]",
  excited: "[excited]",
  sleepy: "[calm][soft tone]",
  sad: "[empathetic][soft tone]",
};

export class FishAudioError extends Error {}

export async function generateFishSpeech({ text, referenceId, apiKey, mood, signal }: {
  text: string; referenceId: string; apiKey: string; mood: Mood; signal: AbortSignal;
}): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, FISH_TIMEOUT_MS);
  try {
    const response = await fetch(FISH_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", model: FISH_MODEL },
      body: JSON.stringify({ text: `${DIRECTIONS[mood]} ${text}`, reference_id: referenceId, format: "mp3",
        prosody: { speed: mood === "sleepy" ? 0.9 : mood === "sad" ? 0.95 : 1 } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Never log the server's raw body: it may echo credentials or personal text.
      const messages: Record<number, string> = {
        400: "Fish 请求无效，请检查 Voice ID", 401: "Fish 验证失败 / API Key 无效",
        402: "Fish 账户额度不足", 403: "Fish 无权访问，请检查 Key 与音色权限",
        404: "Fish Voice ID 或服务不存在", 422: "Fish Voice ID 或请求参数无效",
        429: "Fish 请求过于频繁，请稍后试听",
      };
      throw new FishAudioError(messages[response.status] ?? `Fish 服务暂不可用 (${response.status})`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (type && !/audio\/|application\/octet-stream/i.test(type)) throw new FishAudioError("Fish 返回的不是音频");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // MP3 must start with ID3 metadata or an MPEG frame sync, not HTML/JSON.
    if (bytes.length < 4 || !((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) {
      throw new FishAudioError("Fish 返回空音频或无效 MP3");
    }
    if (controller.signal.aborted) throw new FishAudioError(timedOut ? "Fish 请求超时，已使用系统语音" : "已取消");
    return bytes;
  } catch (error) {
    if (error instanceof FishAudioError) throw error;
    throw new FishAudioError(timedOut ? "Fish 请求超时，已使用系统语音" : signal.aborted ? "已取消" : "Fish 网络请求失败，请检查网络");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

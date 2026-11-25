import type { Mood } from "./whaleVoiceText";

export const VOICE_CACHE_VERSION = 3;

export function voiceCacheIdentity(
  provider: string,
  voiceId: string,
  mood: Mood,
  text: string,
): string {
  return JSON.stringify([VOICE_CACHE_VERSION, provider, voiceId, mood, text]);
}

/** Two independent 32-bit FNV/Murmur-style accumulators; full identity is verified on cache hit. */
export function voiceCacheKey(identity: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < identity.length; i++) {
    a = Math.imul(a ^ identity.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ identity.charCodeAt(i), 0x85ebca6b);
    b ^= b >>> 13;
  }
  return `${VOICE_CACHE_VERSION}_${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

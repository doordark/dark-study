import { VOICE_MODEL, VOICE_PROFILE_VERSION } from "./whaleVoiceProfile";
import type { Mood } from "./whaleVoiceText";

export function voiceCacheIdentity(text: string, mood: Mood, referenceId: string): string {
  return JSON.stringify([VOICE_PROFILE_VERSION, VOICE_MODEL, referenceId, mood, text]);
}

/** Two independent 32-bit accumulators; full identity is also verified on hit. */
export function voiceCacheKey(identity: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < identity.length; i++) {
    a = Math.imul(a ^ identity.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ identity.charCodeAt(i), 0x85ebca6b);
    b ^= b >>> 13;
  }
  return `${VOICE_PROFILE_VERSION}_${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}


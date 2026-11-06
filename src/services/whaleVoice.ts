import { AppState } from 'react-native';
import { useWhaleVoice } from '@/store/useWhaleVoice';
import { speakSystem, stopSystemVoice } from './whaleSystemVoice';
import { detectMood, voiceSpeakable } from './whaleVoiceText';
export { toSpeakable } from './whaleVoiceText';
export type { Mood } from './whaleVoiceText';
export type VoiceResult = { engine: 'system' | 'silent' | 'cancelled'; error?: string };
let token = 0;
let stopped: Promise<void> = Promise.resolve();
const current = (id: number) => id === token && useWhaleVoice.getState().on && AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
export function stopWhaleVoice() { token++; stopped = stopped.then(stopSystemVoice).catch(() => {}); }
export function disposeWhaleVoice() { stopWhaleVoice(); }
export async function speakWhale(text: string): Promise<VoiceResult> {
  stopWhaleVoice(); const id = token;
  await useWhaleVoice.getState().hydrate(); await stopped;
  if (!current(id)) return { engine: 'cancelled' };
  const clean = voiceSpeakable(text);
  if (!clean) return { engine: 'silent' };
  try { speakSystem(clean, detectMood(clean), id, current); return { engine: 'system' }; }
  catch { return { engine: 'silent' }; }
}

import * as Speech from "expo-speech";
import type { Voice } from "expo-speech";
import { PROSODY, splitSentences, type Mood } from "./whaleVoiceText";
const SENTENCE_GAP = 420;

let voicesRequested = false;
let preferredVoice: string | null = null;

function scoreVoice(v: Voice): number {
  const lang = v.language.replace("_", "-").toLowerCase();
  if (lang === "zh-cn") return 4;
  if (lang.startsWith("zh")) return 2;
  return -1;
}

function chooseVoice(list: Voice[]): string | null {
  const candidates = list
    .map((v) => ({ v, score: scoreVoice(v) }))
    .filter((x) => x.score > 0);
  if (!candidates.length) return null;
  // 只换「高音质 + 非网络」的中文音色；找不到就沿用系统默认，
  // 免得随手挑到一个男声或没下载完的网络音色，反而更怪
  const enhanced = candidates.filter(
    (x) =>
      x.v.quality === "Enhanced" &&
      !x.v.identifier.toLowerCase().includes("network"),
  );
  if (!enhanced.length) return null;
  enhanced.sort((a, b) => b.score - a.score);
  return enhanced[0].v.identifier;
}

function ensureVoiceLoaded() {
  if (voicesRequested) return;
  voicesRequested = true;
  Speech.getAvailableVoicesAsync()
    .then((list) => {
      preferredVoice = chooseVoice(list);
    })
    .catch(() => {
      voicesRequested = false;
    });
}

/* ------------------------------------------------------------------ */
/*  朗读：逐句排队 + 句间停顿，随时可以被 stop 打断                      */
/* ------------------------------------------------------------------ */

let isCurrent: (token: number) => boolean = () => false;
let gapTimer: ReturnType<typeof setTimeout> | null = null;

function speakChunk(
  chunks: string[],
  index: number,
  prosody: { pitch: number; rate: number },
  my: number,
  useVoice = true,
) {
  if (!isCurrent(my) || index >= chunks.length) return;
  ensureVoiceLoaded();
  const voice = useVoice ? preferredVoice : null;
  try { Speech.speak(chunks[index], {
    language: "zh-CN",
    pitch: prosody.pitch,
    rate: prosody.rate,
    volume: 1,
    ...(voice ? { voice } : {}),
    onDone: () => {
      if (!isCurrent(my) || index + 1 >= chunks.length) return;
      gapTimer = setTimeout(
        () => speakChunk(chunks, index + 1, prosody, my),
        SENTENCE_GAP,
      );
    },
    onError: () => {
      if (!isCurrent(my)) return;
      // 挑中的音色这台机器上没有时，退回默认引擎再试一次
      if (voice) {
        speakChunk(chunks, index, prosody, my, false);
        return;
      }
      if (index + 1 >= chunks.length) return;
      gapTimer = setTimeout(
        () => speakChunk(chunks, index + 1, prosody, my),
        60,
      );
    },
  }); } catch { /* Sound failure must never interrupt chat. */ }
}


export function speakSystem(text: string, mood: Mood, token: number, current: (token: number) => boolean) {
  isCurrent = current;
  const chunks = splitSentences(text);
  if (chunks.length && current(token)) speakChunk(chunks, 0, PROSODY[mood], token);
}
export async function stopSystemVoice() {
  if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
  try { await Speech.stop(); } catch { /* Best effort, including unsupported web engines. */ }
}

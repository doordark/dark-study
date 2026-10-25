import * as Speech from "expo-speech";
import type { Voice } from "expo-speech";

/**
 * 大肥鱼的语音（参考 whale-voice 项目的「软糯」标尺重做）
 *
 * 之前的问题：pitch 拉到 1.35 —— 等于升了五个多半音，
 * 系统 TTS 会变成又尖又飘的卡通音，听久了很怪。
 * 参考项目的结论是：温柔靠「稳的音高 + 稍慢的语速 + 句间真停顿」，
 * 而不是飙高音；情绪只做 ±10% 的轻量差分，不破坏自然度。
 */

type Mood = "tender" | "happy" | "excited" | "sleepy" | "sad";

interface Prosody {
  pitch: number;
  rate: number;
}

/** 音高贴近自然人声，只在 ±10% 内做情绪差分 */
const PROSODY: Record<Mood, Prosody> = {
  tender: { pitch: 1.03, rate: 0.9 },
  happy: { pitch: 1.07, rate: 0.94 },
  excited: { pitch: 1.1, rate: 1.0 },
  sleepy: { pitch: 0.98, rate: 0.82 },
  sad: { pitch: 0.97, rate: 0.84 },
};

/** 句间停顿：参考项目定稿的 0.42 秒；逗号不切 */
const SENTENCE_GAP = 420;
/** 单段最长字数，太长会一口气念到底没有换气感 */
const MAX_CHUNK = 42;
/** 整条回复最多念这么多，避免念到人已经走开 */
const MAX_TOTAL = 180;

/** 按语气挑一档：先匹配更极端的情绪，再回落到温柔 */
const MOOD_RULES: { mood: Mood; re: RegExp }[] = [
  { mood: "sleepy", re: /困|睡觉|晚安|眯|打哈欠|呼…/ },
  { mood: "sad", re: /呜|委屈|难过|对不起|忘了我|想哭|没关系/ },
  { mood: "excited", re: /哇|好棒|太厉害|冲呀|耶|嗷呜|！！/ },
  { mood: "happy", re: /嘿嘿|开心|喜欢|高兴|陪你|好呀/ },
];

function detectMood(text: string): Mood {
  for (const rule of MOOD_RULES) {
    if (rule.re.test(text)) return rule.mood;
  }
  return "tender";
}

/** TTS 只需要人话：去掉动作说明、颜文字、表情、Markdown 与多余的续符号 */
export function toSpeakable(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[*_`#>|~～]/g, " ")
    // 表情 / 符号区段直接丢掉，别让引擎念成乱码
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
      " ",
    )
    // 只保留中英文、数字和常见标点
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s，。！？、；：,.!?;:…—]/g, " ")
    // 清理连续标点与首尾标点，避免读出一串停顿
    .replace(/([，、；：,;:])\s*(?=[，、；：,;:])/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，。！？、；：\s]+/, "")
    .trim();
  return plain;
}

/** 长句在逗号处断气，短句保持完整（参考项目：句号切、逗号不切） */
function chunkSentence(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK) return [sentence];
  const out: string[] = [];
  let buf = "";
  for (const ch of sentence) {
    buf += ch;
    if (buf.length >= MAX_CHUNK && /[，,、；;]/.test(ch)) {
      out.push(buf);
      buf = "";
    } else if (buf.length >= MAX_CHUNK * 1.8) {
      // 实在没有标点就硬切，避免一口气念太长
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** 按句号 / 问号 / 叹号 / 省略号切句，再压到统一长度 */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？!?…；;]+[。！？!?…；;]*/g) ?? [];
  const chunks: string[] = [];
  let total = 0;
  for (const raw of parts) {
    for (const piece of chunkSentence(raw.trim())) {
      const clean = piece.trim();
      if (!clean) continue;
      if (total + clean.length > MAX_TOTAL) break;
      chunks.push(clean);
      total += clean.length;
    }
    if (total >= MAX_TOTAL) break;
  }
  return chunks;
}

/* ------------------------------------------------------------------ */
/*  音色选择：优先中文、优先高音质、优先本地引擎                        */
/* ------------------------------------------------------------------ */

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

let token = 0;
let gapTimer: ReturnType<typeof setTimeout> | null = null;

function speakChunk(
  chunks: string[],
  index: number,
  prosody: Prosody,
  my: number,
  useVoice = true,
) {
  if (my !== token || index >= chunks.length) return;
  ensureVoiceLoaded();
  const voice = useVoice ? preferredVoice : null;
  Speech.speak(chunks[index], {
    language: "zh-CN",
    pitch: prosody.pitch,
    rate: prosody.rate,
    volume: 1,
    ...(voice ? { voice } : {}),
    onDone: () => {
      if (my !== token || index + 1 >= chunks.length) return;
      gapTimer = setTimeout(
        () => speakChunk(chunks, index + 1, prosody, my),
        SENTENCE_GAP,
      );
    },
    onError: () => {
      if (my !== token) return;
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
  });
}

export function speakWhale(text: string) {
  const chunks = splitSentences(toSpeakable(text));
  if (!chunks.length) return;
  // 打断上一段：token 自增后旧的回调全部失效
  stopWhaleVoice();
  const my = token;
  speakChunk(chunks, 0, PROSODY[detectMood(text)], my);
}

export function stopWhaleVoice() {
  token += 1;
  if (gapTimer) {
    clearTimeout(gapTimer);
    gapTimer = null;
  }
  Speech.stop().catch(() => {});
}

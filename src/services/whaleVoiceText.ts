export type Mood = "normal" | "happy" | "excited" | "sleepy" | "comfort";

export interface Prosody {
  pitch: number;
  rate: number;
}

/** 音高贴近自然人声，只在 ±10% 内做情绪差分 */
export const PROSODY: Record<Mood, Prosody> = {
  normal: { pitch: 1.03, rate: 0.9 },
  happy: { pitch: 1.07, rate: 0.94 },
  excited: { pitch: 1.1, rate: 1.0 },
  sleepy: { pitch: 0.98, rate: 0.82 },
  comfort: { pitch: 0.97, rate: 0.84 },
};

/** 单段最长字数，太长会一口气念到底没有换气感 */
const MAX_CHUNK = 42;
/** 整条回复最多念这么多，避免念到人已经走开 */
const MAX_TOTAL = 180;

/** 按语气挑一档：先匹配更极端的情绪，再回落到温柔 */
const MOOD_RULES: { mood: Mood; re: RegExp }[] = [
  { mood: "sleepy", re: /困|睡觉|晚安|眯|打哈欠|呼…/ },
  { mood: "comfort", re: /呜|委屈|难过|对不起|忘了我|想哭|没关系/ },
  { mood: "excited", re: /哇|好棒|太厉害|冲呀|耶|嗷呜|！！/ },
  { mood: "happy", re: /嘿嘿|开心|喜欢|高兴|好呀/ },
];

export function detectMood(text: string): Mood {
  for (const rule of MOOD_RULES) {
    if (rule.re.test(text)) return rule.mood;
  }
  return "normal";
}

/** TTS 只需要人话：去掉动作说明、颜文字、表情、Markdown 与多余的续符号 */
export function toSpeakable(text: string): string {
  const plain = text
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/(?<!\*)\*[^*\n]+\*(?!\*)/g, " ")
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
export function splitSentences(text: string): string[] {
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


/** Fish reads one complete passage, without per-sentence HTTP calls. */
export function fishSpeakable(text: string): string {
  const clean = toSpeakable(text);
  if (clean.length <= 220) return clean;
  const prefix = clean.slice(0, 220);
  const boundary = Math.max(...["。", "！", "？", "!", "?", "；", "，"].map((p) => prefix.lastIndexOf(p)));
  return boundary >= 60 ? prefix.slice(0, boundary + 1) : prefix.slice(0, 219) + "。";
}

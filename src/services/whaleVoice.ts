import * as Speech from "expo-speech";

/**
 * 大肥鱼的语音：偏高音调 + 稍慢语速，配合软一点的音量，
 * 听起来像一只黏人的小鱼娘而不是导航播报。
 */
const WHALE_VOICE = {
  language: "zh-CN",
  pitch: 1.35,
  rate: 0.94,
  volume: 1,
} as const;

/** TTS 只需要人话：去掉动作说明、颜文字、表情和 Markdown 符号 */
export function toSpeakable(text: string): string {
  const plain = text
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|~～]/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    // 只保留中英文、数字和常见标点，避免把颜文字读成一串乱码
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s，。！？、；：,.!?;:…—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 240 ? `${plain.slice(0, 240)}…` : plain;
}

export function speakWhale(text: string) {
  const plain = toSpeakable(text);
  if (!plain) return;
  Speech.stop();
  Speech.speak(plain, {
    ...WHALE_VOICE,
    onError: () => {},
  });
}

export function stopWhaleVoice() {
  Speech.stop().catch(() => {});
}

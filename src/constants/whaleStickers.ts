import type { ImageSourcePropType } from "react-native";

/** 大肥鱼表情包（来源：本地图包，已裁掉透明边距并压到 320px） */
export type WhaleStickerId =
  | "happy"
  | "calm"
  | "cozy"
  | "sad"
  | "plead"
  | "shock"
  | "sleepy"
  | "shy"
  | "excited";

export const WHALE_STICKERS: Record<WhaleStickerId, ImageSourcePropType> = {
  happy: require("../../assets/whale/sticker-happy.png"),
  calm: require("../../assets/whale/sticker-calm.png"),
  cozy: require("../../assets/whale/sticker-cozy.png"),
  sad: require("../../assets/whale/sticker-sad.png"),
  plead: require("../../assets/whale/sticker-plead.png"),
  shock: require("../../assets/whale/sticker-shock.png"),
  sleepy: require("../../assets/whale/sticker-sleepy.png"),
  shy: require("../../assets/whale/sticker-shy.png"),
  excited: require("../../assets/whale/sticker-excited.png"),
};

/** 日常爱用的一组（随机补表情时不会太出格） */
const CASUAL: WhaleStickerId[] = [
  "happy",
  "calm",
  "cozy",
  "shy",
  "excited",
];

const RULES: { re: RegExp; id: WhaleStickerId }[] = [
  { re: /白饭|吃饭|吃|饿|食堂|馋|奶茶|零食/, id: "cozy" },
  { re: /困|睡|累|熬夜|休息|晚安|眯一会/, id: "sleepy" },
  { re: /哭|难过|委屈|呜|别生气|对不起/, id: "sad" },
  { re: /求|拜托|救命|怎么办|帮帮我|求求/, id: "plead" },
  { re: /震惊|居然|竟然|真的假的|不会吧|离谱|？？|\?!|！？/, id: "shock" },
  { re: /害羞|脸红|不好意思|别夸|讨厌/, id: "shy" },
  { re: /开心|好耶|太棒|厉害|喜欢|爱你|夸|嘿嘿|不错/, id: "happy" },
  { re: /冲|加油|兴奋|起飞|包在我身上|马上|安排/, id: "excited" },
];

/** 按回复内容挑一张贴合情绪的表情；没有匹配时返回 null */
export function matchSticker(text: string): WhaleStickerId | null {
  for (const rule of RULES) {
    if (rule.re.test(text)) return rule.id;
  }
  return null;
}

/** 随机一张日常表情 */
export function randomSticker(exclude?: WhaleStickerId): WhaleStickerId {
  const pool = exclude ? CASUAL.filter((id) => id !== exclude) : CASUAL;
  return pool[Math.floor(Math.random() * pool.length)] ?? "happy";
}

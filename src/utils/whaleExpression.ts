/** 与图片资源分离，供请求、历史和界面共用。 */
export const WHALE_STICKER_MEANINGS = {
  happy: "开心地笑，表示喜悦",
  calm: "平静，认真听你说",
  cozy: "满足、惬意，享受吃饭或放松",
  sad: "难过、委屈或歉意",
  plead: "恳求、拜托",
  shock: "惊讶、震惊",
  sleepy: "困倦、准备睡觉",
  shy: "害羞、脸红",
  excited: "兴奋、庆祝、加油",
} as const;

export type WhaleStickerId = keyof typeof WHALE_STICKER_MEANINGS;

export function isWhaleSticker(value: unknown): value is WhaleStickerId {
  return typeof value === "string" && Object.hasOwn(WHALE_STICKER_MEANINGS, value);
}

/** 空图片消息转成模型可理解的记录；不修改本地保存内容。 */
export function describeWhaleMessage<T extends { role: string; content: string; sticker?: string }>(message: T): T {
  if (!isWhaleSticker(message.sticker)) return message;
  return { ...message, content: `${message.content}\n[${message.role === "assistant" ? "我已发送" : "用户发送"}表情包：${message.sticker}，${WHALE_STICKER_MEANINGS[message.sticker]}]`.trim() };
}

export const WHALE_EXPRESSION_INSTRUCTIONS = `
【表情包由你决定】
在 JSON 顶层额外输出 sticker，取以下 id 或 null：${JSON.stringify(WHALE_STICKER_MEANINGS)}。
先理解用户当前处境和最近对话，再写回复并选择一致的表情；不必每轮发送，不确定或纯信息回复用 null。不要根据单个词触发表情。
用户难过、吵架、冷战、生病或谈严肃困扰时，不发开心、庆祝、惬意或害羞表情；可以平静倾听或不发。只有确实在庆祝或用户明确索要时才用庆祝表情。
用户质疑上一张表情时，依据历史中的“我已发送表情包”记录承认并解释、纠正，不否认发过，不把责任推给用户；本轮通常 sticker 为 null。历史没有记录时坦诚不确定。
sticker 是将实际显示的图片，不是动作描写，不要在 reply 里输出内部 id 或发送标记。`;

/** 校验模型输出；严肃处境与纠错轮次加一层保守兜底。 */
export function resolveWhaleSticker(value: unknown, userText: string, reply: string): WhaleStickerId | null {
  if (!isWhaleSticker(value)) return null;
  if (/表情|贴图/.test(userText) && /错|不合适|为什么|怎么|别发|不要|不对|没发|发过/.test(userText)) return null;
  if (["happy", "excited", "cozy", "shy"].includes(value) &&
    /吵架|冷战|分手|难过|伤心|委屈|焦虑|抑郁|崩溃|生病|去世|痛苦|失恋/.test(`${userText}\n${reply}`)) return null;
  return value;
}

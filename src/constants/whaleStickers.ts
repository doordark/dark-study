import type { ImageSourcePropType } from "react-native";

/** 大肥鱼表情包（来源：本地图包，已裁掉透明边距并压到 320px） */
import type { WhaleStickerId } from "@/utils/whaleExpression";
export type { WhaleStickerId } from "@/utils/whaleExpression";

const STICKER_LOADERS: Record<WhaleStickerId, () => ImageSourcePropType> = {
  happy: () => require("../../assets/whale/sticker-happy.png"),
  calm: () => require("../../assets/whale/sticker-calm.png"),
  cozy: () => require("../../assets/whale/sticker-cozy.png"),
  sad: () => require("../../assets/whale/sticker-sad.png"),
  plead: () => require("../../assets/whale/sticker-plead.png"),
  shock: () => require("../../assets/whale/sticker-shock.png"),
  sleepy: () => require("../../assets/whale/sticker-sleepy.png"),
  shy: () => require("../../assets/whale/sticker-shy.png"),
  excited: () => require("../../assets/whale/sticker-excited.png"),
};

const stickerCache: Partial<Record<WhaleStickerId, ImageSourcePropType>> = {};

/** 按需加载单张表情包贴图并缓存，避免进入页面时一次性 eager require 全部 9 张资源 */
export function getWhaleSticker(id: WhaleStickerId): ImageSourcePropType {
  if (!Object.prototype.hasOwnProperty.call(STICKER_LOADERS, id)) {
    return undefined as unknown as ImageSourcePropType;
  }
  const cached = stickerCache[id];
  if (cached !== undefined) return cached;
  const asset = STICKER_LOADERS[id]();
  stickerCache[id] = asset;
  return asset;
}

/**
 * 保持向后兼容的静态表导出（支持 `WHALE_STICKERS[id]` 与 `Object.keys`），
 * 底层通过惰性 getter 按需触发单张贴图的 `require(...)`。
 */
export const WHALE_STICKERS: Record<WhaleStickerId, ImageSourcePropType> = {
  get happy() {
    return getWhaleSticker("happy");
  },
  get calm() {
    return getWhaleSticker("calm");
  },
  get cozy() {
    return getWhaleSticker("cozy");
  },
  get sad() {
    return getWhaleSticker("sad");
  },
  get plead() {
    return getWhaleSticker("plead");
  },
  get shock() {
    return getWhaleSticker("shock");
  },
  get sleepy() {
    return getWhaleSticker("sleepy");
  },
  get shy() {
    return getWhaleSticker("shy");
  },
  get excited() {
    return getWhaleSticker("excited");
  },
};

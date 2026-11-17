import type { ImageSourcePropType } from "react-native";

/** 大肥鱼表情包（来源：本地图包，已裁掉透明边距并压到 320px） */
import type { WhaleStickerId } from "@/utils/whaleExpression";
export type { WhaleStickerId } from "@/utils/whaleExpression";

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

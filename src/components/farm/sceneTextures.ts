import type { ImageSourcePropType } from "react-native";
export type SceneVariant = "morning-clear" | "morning-rain" | "noon-clear" | "noon-rain" | "evening-clear" | "evening-rain" | "night-clear" | "night-rain" | "rainbow-morning" | "rainbow-evening";
export const FARM_SCENES: Record<SceneVariant, ImageSourcePropType> = {
  "morning-clear": require("../../../assets/images/farm-scene-morning-clear-v6.webp"),
  "morning-rain": require("../../../assets/images/farm-scene-morning-rain-v6.webp"),
  "noon-clear": require("../../../assets/images/farm-scene-noon-clear-v6.webp"),
  "noon-rain": require("../../../assets/images/farm-scene-noon-rain-v6.webp"),
  "evening-clear": require("../../../assets/images/farm-scene-evening-clear-v6.webp"),
  "evening-rain": require("../../../assets/images/farm-scene-evening-rain-v6.webp"),
  "night-clear": require("../../../assets/images/farm-scene-night-clear-v6.webp"),
  "night-rain": require("../../../assets/images/farm-scene-night-rain-v6.webp"),
  "rainbow-morning": require("../../../assets/images/farm-scene-rainbow-morning-v6.webp"),
  "rainbow-evening": require("../../../assets/images/farm-scene-rainbow-evening-v6.webp"),
};
export const MARKET_SCENES: Record<SceneVariant, ImageSourcePropType> = {
  "morning-clear": require("../../../assets/images/market-scene-morning-clear-v6.webp"),
  "morning-rain": require("../../../assets/images/market-scene-morning-rain-v6.webp"),
  "noon-clear": require("../../../assets/images/market-scene-noon-clear-v6.webp"),
  "noon-rain": require("../../../assets/images/market-scene-noon-rain-v6.webp"),
  "evening-clear": require("../../../assets/images/market-scene-evening-clear-v6.webp"),
  "evening-rain": require("../../../assets/images/market-scene-evening-rain-v6.webp"),
  "night-clear": require("../../../assets/images/market-scene-night-clear-v6.webp"),
  "night-rain": require("../../../assets/images/market-scene-night-rain-v6.webp"),
  "rainbow-morning": require("../../../assets/images/market-scene-rainbow-morning-v6.webp"),
  "rainbow-evening": require("../../../assets/images/market-scene-rainbow-evening-v6.webp"),
};

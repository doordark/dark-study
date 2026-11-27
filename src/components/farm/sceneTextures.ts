import type { ImageSourcePropType } from "react-native";

export type SceneVariant =
  | "morning-clear"
  | "morning-rain"
  | "noon-clear"
  | "noon-rain"
  | "evening-clear"
  | "evening-rain"
  | "night-clear"
  | "night-rain"
  | "rainbow-morning"
  | "rainbow-evening";

const farmSceneCache: Partial<Record<SceneVariant, ImageSourcePropType>> = {};
const marketSceneCache: Partial<Record<SceneVariant, ImageSourcePropType>> = {};

function resolveFarmScene(variant: SceneVariant): ImageSourcePropType {
  switch (variant) {
    case "morning-clear":
      return require("../../../assets/images/farm-scene-morning-clear-v6.webp");
    case "morning-rain":
      return require("../../../assets/images/farm-scene-morning-rain-v6.webp");
    case "noon-clear":
      return require("../../../assets/images/farm-scene-noon-clear-v6.webp");
    case "noon-rain":
      return require("../../../assets/images/farm-scene-noon-rain-v6.webp");
    case "evening-clear":
      return require("../../../assets/images/farm-scene-evening-clear-v6.webp");
    case "evening-rain":
      return require("../../../assets/images/farm-scene-evening-rain-v6.webp");
    case "night-clear":
      return require("../../../assets/images/farm-scene-night-clear-v6.webp");
    case "night-rain":
      return require("../../../assets/images/farm-scene-night-rain-v6.webp");
    case "rainbow-morning":
      return require("../../../assets/images/farm-scene-rainbow-morning-v6.webp");
    case "rainbow-evening":
      return require("../../../assets/images/farm-scene-rainbow-evening-v6.webp");
  }
}

function resolveMarketScene(variant: SceneVariant): ImageSourcePropType {
  switch (variant) {
    case "morning-clear":
      return require("../../../assets/images/market-scene-morning-clear-v6.webp");
    case "morning-rain":
      return require("../../../assets/images/market-scene-morning-rain-v6.webp");
    case "noon-clear":
      return require("../../../assets/images/market-scene-noon-clear-v6.webp");
    case "noon-rain":
      return require("../../../assets/images/market-scene-noon-rain-v6.webp");
    case "evening-clear":
      return require("../../../assets/images/market-scene-evening-clear-v6.webp");
    case "evening-rain":
      return require("../../../assets/images/market-scene-evening-rain-v6.webp");
    case "night-clear":
      return require("../../../assets/images/market-scene-night-clear-v6.webp");
    case "night-rain":
      return require("../../../assets/images/market-scene-night-rain-v6.webp");
    case "rainbow-morning":
      return require("../../../assets/images/market-scene-rainbow-morning-v6.webp");
    case "rainbow-evening":
      return require("../../../assets/images/market-scene-rainbow-evening-v6.webp");
  }
}

/** 按需懒解析农场主场景贴图，避免进入农场时一次性求值全部 10 个时段/天气资源 */
export function getFarmSceneTexture(variant: SceneVariant): ImageSourcePropType {
  const cached = farmSceneCache[variant];
  if (cached !== undefined) return cached;
  const resolved = resolveFarmScene(variant);
  farmSceneCache[variant] = resolved;
  return resolved;
}

/** 按需懒解析集市场景贴图，仅在访问具体时段/天气变体时触发 require() */
export function getMarketSceneTexture(variant: SceneVariant): ImageSourcePropType {
  const cached = marketSceneCache[variant];
  if (cached !== undefined) return cached;
  const resolved = resolveMarketScene(variant);
  marketSceneCache[variant] = resolved;
  return resolved;
}

/** 保持向后兼容的索引视图：底层通过懒 getter 转发，导入模块零提前 require 开销 */
export const FARM_SCENES: Record<SceneVariant, ImageSourcePropType> = {
  get "morning-clear"() {
    return getFarmSceneTexture("morning-clear");
  },
  get "morning-rain"() {
    return getFarmSceneTexture("morning-rain");
  },
  get "noon-clear"() {
    return getFarmSceneTexture("noon-clear");
  },
  get "noon-rain"() {
    return getFarmSceneTexture("noon-rain");
  },
  get "evening-clear"() {
    return getFarmSceneTexture("evening-clear");
  },
  get "evening-rain"() {
    return getFarmSceneTexture("evening-rain");
  },
  get "night-clear"() {
    return getFarmSceneTexture("night-clear");
  },
  get "night-rain"() {
    return getFarmSceneTexture("night-rain");
  },
  get "rainbow-morning"() {
    return getFarmSceneTexture("rainbow-morning");
  },
  get "rainbow-evening"() {
    return getFarmSceneTexture("rainbow-evening");
  },
};

export const MARKET_SCENES: Record<SceneVariant, ImageSourcePropType> = {
  get "morning-clear"() {
    return getMarketSceneTexture("morning-clear");
  },
  get "morning-rain"() {
    return getMarketSceneTexture("morning-rain");
  },
  get "noon-clear"() {
    return getMarketSceneTexture("noon-clear");
  },
  get "noon-rain"() {
    return getMarketSceneTexture("noon-rain");
  },
  get "evening-clear"() {
    return getMarketSceneTexture("evening-clear");
  },
  get "evening-rain"() {
    return getMarketSceneTexture("evening-rain");
  },
  get "night-clear"() {
    return getMarketSceneTexture("night-clear");
  },
  get "night-rain"() {
    return getMarketSceneTexture("night-rain");
  },
  get "rainbow-morning"() {
    return getMarketSceneTexture("rainbow-morning");
  },
  get "rainbow-evening"() {
    return getMarketSceneTexture("rainbow-evening");
  },
};

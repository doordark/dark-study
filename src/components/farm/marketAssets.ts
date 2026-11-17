import { Asset } from 'expo-asset';
import { MARKET_SCENES, type SceneVariant } from './sceneTextures';

export const MARKET_PEOPLE = require('../../../assets/images/farm-runtime/vendors.png');
export const HERO_IDLE = require('../../../assets/images/farm-people-idle-v2.png');
export const HERO_WALK = require('../../../assets/images/farm-runtime/hero-walk.png');

// Download only the upcoming scene, never all ten weather/day variants.
// Expo owns the file cache; retain just one warm-up promise and retry failures.
let warming: { variant: SceneVariant; promise: Promise<void> } | undefined;
export function warmMarketAssets(variant: SceneVariant): Promise<void> {
  if (warming?.variant === variant) return warming.promise;
  const promise = Asset.loadAsync([MARKET_SCENES[variant] as number, MARKET_PEOPLE, HERO_IDLE, HERO_WALK])
    .then(() => {})
    .catch(() => { if (warming?.promise === promise) warming = undefined; });
  warming = { variant, promise };
  return promise;
}

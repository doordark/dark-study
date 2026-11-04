import type { ImageSourcePropType } from "react-native";
import { AnimatedAtlas } from "./AnimatedAtlas";
export type PetAnimationKind = "idle" | "happy" | "wave" | "sleep" | "dance" | "spin" | "eat" | "study" | "hurt";
const ACTIONS = require("../../assets/whale/pet-actions-v2.png");
const row = (offset: number, count = 8) => Array.from({ length: count }, (_, i) => offset + i);
type Motion = { source: ImageSourcePropType; columns: number; rows: number; frames: number[]; holds?: number[]; frameDuration: number; loop?: boolean; loopFrom?: number };
export const PET_MOTION: Record<PetAnimationKind, Motion> = {
  hurt: { source: require("../../assets/whale/pet-hurt-v1.png"), columns: 4, rows: 2, frames: row(0), frameDuration: 70, loop: false },
  idle: { source: require("../../assets/whale/pet-idle-v2.png"), columns: 4, rows: 3, frames: row(0, 12), frameDuration: 80, holds: [900,400,400,400,70,70,90,70,90,400,400,400] },
  happy: { source: ACTIONS, columns: 8, rows: 5, frames: row(0), frameDuration: 70, loop: false },
  wave: { source: ACTIONS, columns: 8, rows: 5, frames: row(8), frameDuration: 70, loop: false },
  eat: { source: ACTIONS, columns: 8, rows: 5, frames: row(16), frameDuration: 70, loop: false },
  study: { source: ACTIONS, columns: 8, rows: 5, frames: row(24), frameDuration: 110, holds: [900,110,110,110,110,110,110,500] },
  // Drowsiness/yawn is an intro; closed-eye breathing loops without waking every cycle.
  sleep: { source: ACTIONS, columns: 8, rows: 5, frames: row(32), frameDuration: 110, holds: [400,110,110,160,500,500,500,500], loopFrom: 4 },
  dance: { source: require("../../assets/whale/pet-dance-v2.png"), columns: 4, rows: 4, frames: row(0, 16), frameDuration: 65 },
  spin: { source: require("../../assets/whale/pet-spin-v2.png"), columns: 4, rows: 4, frames: row(0, 16), frameDuration: 65 },
};
export function PetAnimation({ kind, width, height, active = true }: { kind: PetAnimationKind; width: number; height: number; active?: boolean }) {
  return <AnimatedAtlas key={kind} {...PET_MOTION[kind]} width={width} height={height} active={active} />;
}

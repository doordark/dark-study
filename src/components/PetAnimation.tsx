import type { ImageSourcePropType } from "react-native";
import { AnimatedAtlas } from "./AnimatedAtlas";
export type PetAnimationKind = "idle" | "happy" | "wave" | "sleep" | "dance" | "spin" | "eat" | "study";
const ACTIONS = require("../../assets/whale/pet-actions-sheet.png");
const MOTION: Record<PetAnimationKind, { source: ImageSourcePropType; rows: number; frames: number[]; holds: number[] }> = {
  idle: { source: require("../../assets/whale/pet-idle-sheet.png"), rows: 2, frames: [0,1,2,3,4,5,6,7], holds: [1600,260,260,90,110,90,260,300] },
  happy: { source: ACTIONS, rows: 4, frames: [0,1,2,3], holds: [300,180,180,300] },
  wave: { source: ACTIONS, rows: 4, frames: [1,2,3,2], holds: [160,160,160,160] },
  eat: { source: ACTIONS, rows: 4, frames: [4,5,6,7], holds: [500,300,400,650] },
  study: { source: ACTIONS, rows: 4, frames: [8,9,10,11], holds: [1100,500,1000,900] },
  sleep: { source: ACTIONS, rows: 4, frames: [12,13,14,15], holds: [600,700,2600,1600] },
  dance: { source: require("../../assets/whale/pet-dance-sheet.png"), rows: 2, frames: [0,1,2,3,4,5,6,7], holds: [140,140,140,140,140,140,140,140] },
  spin: { source: require("../../assets/whale/pet-spin-sheet.png"), rows: 2, frames: [0,1,2,3,4,5,6,7], holds: [140,140,140,140,140,140,140,140] },
};
export function PetAnimation({ kind, width, height }: { kind: PetAnimationKind; width: number; height: number }) {
  const motion = MOTION[kind];
  return <AnimatedAtlas key={kind} {...motion} columns={4} width={width} height={height} />;
}

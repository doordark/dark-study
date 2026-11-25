import { memo } from "react";
import type { ImageSourcePropType } from "react-native";
import { AnimatedAtlas } from "./AnimatedAtlas";

export type PetAnimationKind =
  | "idle"
  | "happy"
  | "wave"
  | "sleep"
  | "dance"
  | "spin"
  | "eat"
  | "study"
  | "hurt"
  | "walk"
  | "peek"
  | "dangle"
  | "cuddle";

const ACTIONS = require("../../assets/whale/pet-actions-v2.png");
const LIVELY = require("../../assets/whale/pet-lively-v1.png");
const row = (offset: number, count = 8) => Array.from({ length: count }, (_, i) => offset + i);

type Motion = {
  source: ImageSourcePropType;
  columns: number;
  rows: number;
  frames: number[];
  holds?: number[];
  frameDuration: number;
  loop?: boolean;
  loopFrom?: number;
};

export const PET_MOTION: Record<PetAnimationKind, Motion> = {
  hurt: {
    source: require("../../assets/whale/pet-hurt-v1.png"),
    columns: 4,
    rows: 2,
    frames: row(0),
    frameDuration: 70,
    loop: false,
  },
  // 加快呼吸与眨眼节奏（告别原先 900ms/400ms 停顿死板感），叠加程序化呼吸起伏
  idle: {
    source: require("../../assets/whale/pet-idle-v2.png"),
    columns: 4,
    rows: 3,
    frames: row(0, 12),
    frameDuration: 80,
    holds: [520, 220, 220, 240, 65, 65, 85, 65, 80, 220, 220, 260],
  },
  happy: { source: ACTIONS, columns: 8, rows: 5, frames: row(0), frameDuration: 68, loop: false },
  wave: { source: ACTIONS, columns: 8, rows: 5, frames: row(8), frameDuration: 68, loop: false },
  eat: { source: ACTIONS, columns: 8, rows: 5, frames: row(16), frameDuration: 72, loop: false },
  study: {
    source: ACTIONS,
    columns: 8,
    rows: 5,
    frames: row(24),
    frameDuration: 105,
    holds: [720, 110, 110, 110, 110, 110, 110, 420],
  },
  // Drowsiness/yawn is an intro; closed-eye breathing loops without waking every cycle.
  sleep: {
    source: ACTIONS,
    columns: 8,
    rows: 5,
    frames: row(32),
    frameDuration: 110,
    holds: [380, 110, 110, 160, 440, 440, 440, 440],
    loopFrom: 4,
  },
  dance: {
    source: require("../../assets/whale/pet-dance-v2.png"),
    columns: 4,
    rows: 4,
    frames: row(0, 16),
    frameDuration: 62,
  },
  spin: {
    source: require("../../assets/whale/pet-spin-v2.png"),
    columns: 4,
    rows: 4,
    frames: row(0, 16),
    frameDuration: 60,
  },
  // 全新灵动扩展动作图集（8x4）：小跑巡游 / 贴边坐着晃脚探头 / 拎起悬空挣扎 / 摸头害羞蹭蹭
  walk: { source: LIVELY, columns: 8, rows: 4, frames: row(0), frameDuration: 82 },
  peek: {
    source: LIVELY,
    columns: 8,
    rows: 4,
    frames: row(8),
    frameDuration: 150,
    holds: [360, 160, 180, 220, 110, 260, 180, 320],
  },
  dangle: { source: LIVELY, columns: 8, rows: 4, frames: row(16), frameDuration: 85 },
  cuddle: {
    source: LIVELY,
    columns: 8,
    rows: 4,
    frames: row(24),
    frameDuration: 105,
    holds: [110, 100, 180, 220, 180, 180, 120, 140],
    loop: false,
  },
};

export const PetAnimation = memo(function PetAnimation({
  kind,
  width,
  height,
  active = true,
}: {
  kind: PetAnimationKind;
  width: number;
  height: number;
  active?: boolean;
}) {
  return <AnimatedAtlas key={kind} {...PET_MOTION[kind]} width={width} height={height} active={active} />;
});

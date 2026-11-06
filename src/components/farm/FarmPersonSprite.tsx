import { useMemo } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { AnimatedAtlas } from "@/components/AnimatedAtlas";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { RESIDENTS, type ResidentId } from "@/utils/farmLife";
const WALK = require("../../../assets/images/farm-people-walk-v2.png");
const IDLE = require("../../../assets/images/farm-people-idle-v2.png");
const TALK = require("../../../assets/images/farm-people-talk-v2.png");
const FAMILY = require("../../../assets/images/farm-people-family-v3.png");
const FAMILY_IDLE = require("../../../assets/images/farm-people-family-idle-v3.png");
const FAMILY_TALK = require("../../../assets/images/farm-people-family-talk-v3.png");
const HERO_LEFT = require("../../../assets/images/farm-player-walk-left-v7.png");
const HERO_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const IDLE_HOLDS = [1700, 500, 80, 90, 80, 650];

export function FarmPersonSprite({ who, activity = "idle", size, active = true, walkSpeed = 26, centered = false }: {
  who: ResidentId | "hero"; activity?: "idle" | "walk" | "talk"; size: number; active?: boolean;
  walkSpeed?: number; centered?: boolean;
}) {
  const awake = useAnimationActive(active);
  const reduced = useReducedMotion();
  const walking = activity === "walk";
  const row = who === "hero" ? 6 : RESIDENTS[who].row;
  const family = row < 5;
  const talking = activity === "talk";
  const columns = family || walking ? 8 : 6;
  const stillPlayer = who === "hero" && activity === "idle";
  const frames = useMemo(() => Array.from({ length: stillPlayer ? 1 : columns }, (_, i) => row * columns + i), [columns, row, stillPlayer]);
  const source = family
    ? walking ? FAMILY : talking ? FAMILY_TALK : FAMILY_IDLE
    : walking ? WALK : talking ? TALK : IDLE;
  const holds = walking || talking && !family ? undefined
    : family
      ? talking ? [280, 180, 230, 320, 220, 250, 300, 240] : [1800, 300, 90, 100, 90, 500, 700, 400]
      : IDLE_HOLDS;
  // The authored strip has transparent padding; crop it without distorting the body.
  // Normalize its left-facing artwork to the right-facing convention of parent sprites.
  if (who === "hero" && walking) return <View style={{ width: size, height: size * 1.25, overflow: "hidden" }}>
    <View style={{ position: "absolute", top: -size * 200 / 271.5, transform: [{ scaleX: -1 }] }}>
      <AnimatedAtlas source={HERO_LEFT} columns={8} rows={1} frames={HERO_STEPS} frameDuration={100} width={size} height={size * 724 / 271.5} active={awake && !reduced} />
    </View>
  </View>;
  return <View style={{ width: size, height: size * 1.25, paddingTop: family ? size * (centered ? 0.125 : 0.24924) : 0 }}>
    <AnimatedAtlas key={`${who}:${activity}`} source={source} columns={columns} rows={family ? 5 : 7} frames={frames}
      holds={holds} frameDuration={walking ? Math.max(who === "hero" ? 85 : 45, Math.min(130, 2080 / walkSpeed)) : 110}
      width={size} height={size * (family ? 1.0014 : 1.25)} active={awake && !reduced} />
  </View>;
}

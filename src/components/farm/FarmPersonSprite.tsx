import { useMemo } from "react";
import { AnimatedAtlas } from "@/components/AnimatedAtlas";
import { RESIDENTS, type ResidentId } from "@/utils/farmLife";
const PEOPLE = require("../../../assets/images/farm-people-sheet.png");
export function FarmPersonSprite({ who, activity = "idle", size, active = true }: {
  who: ResidentId | "hero"; activity?: "idle" | "walk" | "talk"; size: number; active?: boolean;
}) {
  const row = who === "hero" ? 6 : RESIDENTS[who].row;
  const motion = useMemo(() => {
    const poses = activity === "walk" ? [1,2] : activity === "talk" ? [0,3] : [0];
    return { frames: poses.map((frame) => row * 4 + frame), holds: poses.map(() => activity === "walk" ? 140 : 500) };
  }, [activity, row]);
  return <AnimatedAtlas key={`${who}-${activity}`} source={PEOPLE} columns={4} rows={7} {...motion} width={size} height={size * 1.25} active={active} />;
}

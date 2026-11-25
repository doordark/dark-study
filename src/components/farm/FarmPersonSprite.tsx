import { memo, useMemo } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { AnimatedAtlas } from "@/components/AnimatedAtlas";
import type { FarmEmotionPose } from "@/utils/farmEmotion";
import { RESIDENTS, type ResidentId } from "@/utils/farmLife";
import { HERO_IDLE, HERO_WALK } from './marketAssets';
import { useSettings } from '@/store/useSettings';
import { renderQuality } from '@/utils/renderQuality';

const WALK = require("../../../assets/images/farm-people-walk-v2.png");
const IDLE = HERO_IDLE;
const TALK = require("../../../assets/images/farm-people-talk-v2.png");
const FAMILY = require("../../../assets/images/farm-runtime/farm-people-family-v3.png");
const FAMILY_IDLE = require("../../../assets/images/farm-runtime/farm-people-family-idle-v3.png");
const FAMILY_TALK = require("../../../assets/images/farm-runtime/farm-people-family-talk-v3.png");
const FAMILY_EMOTIONS_POS = require("../../../assets/images/farm-runtime/family-emotions-pos.png");
const FAMILY_EMOTIONS_NEG = require("../../../assets/images/farm-runtime/family-emotions-neg.png");
const MISC_EMOTIONS = require("../../../assets/images/farm-runtime/misc-emotions.png");
const HERO_LEFT = HERO_WALK;
const HERO_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const IDLE_HOLDS = [1700, 500, 80, 90, 80, 650];
const FAMILY_IDLE_HOLDS = [1800, 300, 90, 100, 90, 500, 700, 400];
const FAMILY_TALK_HOLDS = [280, 180, 230, 320, 220, 250, 300, 240];
const EMOTION_HAPPY_HOLDS = [220, 160, 180, 220];
const EMOTION_SAD_HOLDS = [420, 320, 380, 340];
const EMOTION_ANGRY_HOLDS = [180, 150, 160, 210];
const EMOTION_SHY_HOLDS = [480, 360, 480, 360];
const EMOTION_SLEEPY_HOLDS = [620, 420, 620, 420];

export const FarmPersonSprite = memo(function FarmPersonSprite({
  who,
  activity = "idle",
  emotionPose = "neutral",
  size,
  active = true,
  walkSpeed = 26,
  centered = false,
}: {
  who: ResidentId | "hero";
  activity?: "idle" | "walk" | "talk";
  emotionPose?: FarmEmotionPose;
  size: number;
  active?: boolean;
  walkSpeed?: number;
  centered?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const quality = useSettings(s => s.renderQuality);
  const reduced = reducedMotion || (activity === 'idle' && emotionPose === 'neutral' && !renderQuality(quality).idleAnimation);
  const walking = activity === "walk";
  const talking = activity === "talk";
  const row = who === "hero" ? 6 : RESIDENTS[who].row;
  const family = row < 5;
  const useEmotion = !walking && !talking && emotionPose !== "neutral";

  const emotionConfig = useMemo(() => {
    if (!useEmotion) return null;
    const isPos = emotionPose === "happy" || emotionPose === "shy" || emotionPose === "sleepy";
    const cols =
      emotionPose === "happy"
        ? [0, 1, 2, 3]
        : emotionPose === "shy"
          ? [4, 5, 4, 5]
          : emotionPose === "sleepy"
            ? [6, 7, 6, 7]
            : emotionPose === "sad"
              ? [0, 1, 2, 3]
              : [4, 5, 6, 7];
    const holds =
      emotionPose === "happy"
        ? EMOTION_HAPPY_HOLDS
        : emotionPose === "angry"
          ? EMOTION_ANGRY_HOLDS
          : emotionPose === "sad"
            ? EMOTION_SAD_HOLDS
            : emotionPose === "sleepy"
              ? EMOTION_SLEEPY_HOLDS
              : EMOTION_SHY_HOLDS;
    if (family) {
      return {
        source: isPos ? FAMILY_EMOTIONS_POS : FAMILY_EMOTIONS_NEG,
        rows: 5,
        frames: cols.map(c => row * 8 + c),
        holds,
      };
    }
    // misc-emotions.png: Row 0=chicken pos, Row 1=chicken neg, Row 2=hero pos, Row 3=hero neg
    const miscRow = (who === "hero" ? 2 : 0) + (isPos ? 0 : 1);
    return {
      source: MISC_EMOTIONS,
      rows: 4,
      frames: cols.map(c => miscRow * 8 + c),
      holds,
    };
  }, [useEmotion, emotionPose, family, row, who]);

  const columns = family || walking ? 8 : 6;
  const stillPlayer = who === "hero" && activity === "idle" && !useEmotion;
  const frames = useMemo(
    () => Array.from({ length: stillPlayer ? 1 : columns }, (_, i) => row * columns + i),
    [columns, row, stillPlayer],
  );
  const source = family
    ? walking ? FAMILY : talking ? FAMILY_TALK : FAMILY_IDLE
    : walking ? WALK : talking ? TALK : IDLE;
  const holds = walking || (talking && !family)
    ? undefined
    : family
      ? talking ? FAMILY_TALK_HOLDS : FAMILY_IDLE_HOLDS
      : IDLE_HOLDS;

  if (emotionConfig) {
    return (
      <View style={{ width: size, height: size * 1.25, paddingTop: size * (centered ? 0.125 : 0.24924) }}>
        <AnimatedAtlas
          source={emotionConfig.source}
          columns={8}
          rows={emotionConfig.rows}
          frames={emotionConfig.frames}
          holds={emotionConfig.holds}
          frameDuration={200}
          width={size}
          height={size * 1.0014}
          active={active && !reducedMotion}
        />
      </View>
    );
  }

  // Runtime frames bake the original viewport crop; preserve facing convention.
  if (who === "hero" && walking) {
    return (
      <View style={{ width: size, height: size * 1.25, transform: [{ scaleX: -1 }] }}>
        <AnimatedAtlas source={HERO_LEFT} columns={8} rows={1} frames={HERO_STEPS} frameDuration={100} width={size} height={size * 1.25} active={active && !reduced} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size * 1.25, paddingTop: family ? size * (centered ? 0.125 : 0.24924) : 0 }}>
      <AnimatedAtlas
        source={source}
        columns={columns}
        rows={family ? 5 : 7}
        frames={frames}
        holds={holds}
        frameDuration={walking ? Math.max(who === "hero" ? 85 : 45, Math.min(130, 2080 / walkSpeed)) : 110}
        width={size}
        height={size * (family ? 1.0014 : 1.25)}
        active={active && !reduced}
      />
    </View>
  );
});

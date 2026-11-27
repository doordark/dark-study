import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { AnimatedAtlas } from '@/components/AnimatedAtlas';
import { useSettings } from '@/store/useSettings';
import type { FarmEmotionPose } from '@/utils/farmEmotion';
import { renderQuality } from '@/utils/renderQuality';
import { VISITORS, type VisitorId } from '@/utils/farmVisitors';

const VISITORS_WALK = require('../../../assets/images/farm-visitors-walk.png');
const VISITORS_IDLE = require('../../../assets/images/farm-visitors-idle.png');
const VISITORS_TALK = require('../../../assets/images/farm-visitors-talk.png');
const VISITORS_EMOTIONS_POS = require('../../../assets/images/farm-runtime/visitors-emotions-pos.png');
const VISITORS_EMOTIONS_NEG = require('../../../assets/images/farm-runtime/visitors-emotions-neg.png');

/** 与 FarmPersonSprite 完全一致的 8 帧停顿与帧率参数（8×8 图集：Row 0..4 常驻与彩蛋访客，Row 5..7 Claude/GPT/Gemini） */
const VISITOR_IDLE_HOLDS = [1800, 300, 90, 100, 90, 500, 700, 400];
const VISITOR_TALK_HOLDS = [280, 180, 230, 320, 220, 250, 300, 240];
const HORROR_GAMING_HOLDS = [240, 160, 190, 220, 170, 200, 180, 210];
const EMOTION_HAPPY_HOLDS = [210, 160, 175, 220];
const EMOTION_SAD_HOLDS = [420, 320, 380, 340];
const EMOTION_ANGRY_HOLDS = [180, 150, 160, 210];
const EMOTION_SHY_HOLDS = [480, 360, 480, 360];
const EMOTION_SLEEPY_HOLDS = [620, 420, 620, 420];

export const FarmVisitorSprite = memo(function FarmVisitorSprite({
  who,
  activity = 'idle',
  emotionPose = 'neutral',
  size,
  active = true,
  walkSpeed = 22,
  centered = false,
}: {
  who: VisitorId;
  activity?: 'idle' | 'walk' | 'talk';
  emotionPose?: FarmEmotionPose;
  size: number;
  active?: boolean;
  walkSpeed?: number;
  centered?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const quality = useSettings(s => s.renderQuality);
  const reduced = reducedMotion || (activity === 'idle' && emotionPose === 'neutral' && !renderQuality(quality).idleAnimation);
  const row = VISITORS[who].row;
  const walking = activity === 'walk';
  const talking = activity === 'talk';
  const isHorror = who === 'dark_xushuiyin';
  const useEmotion = !walking && !talking && emotionPose !== 'neutral';

  const emotionConfig = useMemo(() => {
    if (!useEmotion) return null;
    const isPos = emotionPose === 'happy' || emotionPose === 'shy' || emotionPose === 'sleepy';
    const cols =
      emotionPose === 'happy'
        ? [0, 1, 2, 3]
        : emotionPose === 'shy'
          ? [4, 5, 4, 5]
          : emotionPose === 'sleepy'
            ? [6, 7, 6, 7]
            : emotionPose === 'sad'
              ? [0, 1, 2, 3]
              : [4, 5, 6, 7];
    const holds =
      emotionPose === 'happy'
        ? EMOTION_HAPPY_HOLDS
        : emotionPose === 'angry'
          ? EMOTION_ANGRY_HOLDS
          : emotionPose === 'sad'
            ? EMOTION_SAD_HOLDS
            : emotionPose === 'sleepy'
              ? EMOTION_SLEEPY_HOLDS
              : EMOTION_SHY_HOLDS;
    return {
      source: isPos ? VISITORS_EMOTIONS_POS : VISITORS_EMOTIONS_NEG,
      frames: cols.map(c => row * 8 + c),
      holds,
    };
  }, [useEmotion, emotionPose, row]);

  const frames = useMemo(() => Array.from({ length: 8 }, (_, i) => row * 8 + i), [row]);
  const source = walking ? VISITORS_WALK : talking ? VISITORS_TALK : VISITORS_IDLE;
  const holds = walking
    ? undefined
    : talking
      ? VISITOR_TALK_HOLDS
      : isHorror
        ? HORROR_GAMING_HOLDS
        : VISITOR_IDLE_HOLDS;

  if (emotionConfig) {
    return (
      <View style={{ width: size, height: size * 1.25, paddingTop: size * (centered ? 0.125 : 0.24924) }}>
        <AnimatedAtlas
          source={emotionConfig.source}
          columns={8}
          rows={8}
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

  return (
    <View style={{ width: size, height: size * 1.25, paddingTop: size * (centered ? 0.125 : 0.24924) }}>
      <AnimatedAtlas
        source={source}
        columns={8}
        rows={8}
        frames={frames}
        holds={holds}
        frameDuration={walking ? Math.max(45, Math.min(130, 2080 / walkSpeed)) : 110}
        width={size}
        height={size * 1.0014}
        active={active && !reduced}
      />
    </View>
  );
});

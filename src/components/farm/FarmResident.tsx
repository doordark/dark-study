import { FarmText } from './FarmSkin';
import { memo, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import type { FarmEmotionPose } from '@/utils/farmEmotion';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import { remainingResidentMotion, type ResidentModel } from '@/utils/farmResidentAI';
import { FarmPersonSprite } from './FarmPersonSprite';

/** Display only: the central controller owns decisions, position and conversations. */
export const FarmResident = memo(function FarmResident({
  resident,
  scale,
  active,
  reducedMotion,
  followed = false,
  sleepDeprived = false,
  soloBadge,
  weatherBadge,
  weatherBadgeKind,
  emotionPose = 'neutral',
  emotionBadge,
  onTalk
}: {
  resident: ResidentModel;
  scale: number;
  active: boolean;
  reducedMotion: boolean;
  followed?: boolean;
  sleepDeprived?: boolean;
  soloBadge?: string;
  weatherBadge?: string;
  weatherBadgeKind?: 'rain' | 'rainbow';
  emotionPose?: FarmEmotionPose;
  emotionBadge?: string;
  onTalk: (who: ResidentId, position: {
    x: number;
    y: number;
  }) => void;
}) {
  const who = resident.id,
    meta = RESIDENTS[who],
    motion = resident.motion;
  const x = useSharedValue(resident.logicalPosition.x),
    y = useSharedValue(resident.logicalPosition.y);
  const face = useSharedValue<number>(resident.face);
  // Delay walk-cycle sprite animation while yielding/pausing before motion.startedAt to prevent air-walking.
  const [walkReady, setWalkReady] = useState(() => Boolean(motion) && (motion?.startedAt ?? 0) <= Date.now());

  useEffect(() => {
    cancelAnimation(x);
    cancelAnimation(y);
    if (!active) {
      setWalkReady(false);
      return;
    }
    if (!motion || reducedMotion) {
      x.set(resident.logicalPosition.x);
      y.set(resident.logicalPosition.y);
      setWalkReady(false);
      return;
    }
    const nowMs = Date.now();
    const delayMs = Math.max(0, motion.startedAt - nowMs);
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    if (delayMs > 40) {
      setWalkReady(false);
      delayTimer = setTimeout(() => setWalkReady(true), delayMs);
    } else {
      setWalkReady(true);
    }

    const remaining = remainingResidentMotion(motion, nowMs);
    x.set(remaining.start.x);
    y.set(remaining.start.y);
    if (remaining.steps.length) {
      x.set(withDelay(delayMs, withSequence(...remaining.steps.map(s => withTiming(s.point.x, {
        duration: Math.max(16, s.duration),
        easing: Easing.linear
      })))));
      y.set(withDelay(delayMs, withSequence(...remaining.steps.map(s => withTiming(s.point.y, {
        duration: Math.max(16, s.duration),
        easing: Easing.linear
      })))));
    }
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      cancelAnimation(x);
      cancelAnimation(y);
    };
    // Logical snapshots are for the game; an unchanged motion must not restart every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, active, reducedMotion, x, y]);

  useEffect(() => {
    face.set(resident.face);
  }, [resident.face, face]);

  // 0.15 logical-px deadzone avoids left-right sprite jitter on near-vertical segments.
  useAnimatedReaction(() => x.get(), (current, previous) => {
    if (previous !== null && Math.abs(current - previous) > 0.15) face.set(current > previous ? 1 : -1);
  });

  // Strict 2.5D depth sorting by foot Y: speech bubbles live in top-level FarmSpeechOverlay,
  // so talking characters never float above foreground roofs, trees or closer people.
  const position = useAnimatedStyle(() => ({
    zIndex: Math.round(y.get()),
    transform: [{
      translateX: (x.get() - 11) * scale
    }, {
      translateY: (y.get() - 27.5) * scale
    }]
  }));

  const facing = useAnimatedStyle(() => ({
    transform: [{
      scaleX: face.get()
    }]
  }));

  const talking = resident.state === 'talking';
  const walking = Boolean(motion) && walkReady && active && !reducedMotion;
  const taskLabel = resident.task ? resident.task.action.type === 'fetch_water' ? '打水' : resident.task.action.type === 'water_crops' ? '浇水' : resident.task.action.type === 'talk_to' ? '找人' : resident.task.action.type === 'go_home' ? '回家' : resident.task.action.type === 'rest' ? '休息' : '散心' : '';
  const resolvedPose: FarmEmotionPose =
    walking || talking
      ? 'neutral'
      : soloBadge === '深夜emo'
        ? 'sad'
        : sleepDeprived && emotionPose === 'neutral'
          ? 'sleepy'
          : emotionPose;

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 22 * scale,
        height: 28 * scale
      }, position]}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: Math.max(-8, 22 * scale * 0.24924 - 16),
          left: -50,
          right: -50,
          alignSelf: 'center',
          alignItems: 'center',
        }}
      >
        <FarmText
          variant="label"
          numberOfLines={1}
          style={{
            color: soloBadge
              ? '#E8E3FA'
              : sleepDeprived
                ? '#694957'
                : weatherBadge
                  ? (weatherBadgeKind === 'rainbow' ? '#9C6219' : '#2D5878')
                  : talking
                    ? '#755538'
                    : '#5B5138',
            backgroundColor: soloBadge
              ? 'rgba(54,48,88,0.88)'
              : sleepDeprived
                ? 'rgba(243,231,240,0.92)'
                : weatherBadge
                  ? (weatherBadgeKind === 'rainbow' ? 'rgba(253,240,209,0.94)' : 'rgba(226,240,252,0.9)')
                  : 'rgba(255,247,222,0.88)',
            paddingHorizontal: 6,
            paddingVertical: 1,
            overflow: 'hidden',
            borderRadius: 7,
            fontSize: 10
          }}
        >
          {emotionBadge && resolvedPose !== 'neutral' ? `${emotionBadge} ` : ''}
          {meta.name}
          {soloBadge
            ? ` · ${soloBadge}`
            : sleepDeprived
              ? ' · 睡眠不足'
              : taskLabel
                ? ` · ${taskLabel}`
                : weatherBadge
                  ? ` · ${weatherBadge}`
                  : talking
                    ? ' ···'
                    : ''}
        </FarmText>
      </View>
      {followed ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 2 * scale,
            bottom: -1 * scale,
            width: 18 * scale,
            height: 7 * scale,
            borderRadius: 99,
            borderWidth: 1.5,
            borderColor: '#E0A14A',
            backgroundColor: 'rgba(246, 206, 126, 0.34)',
          }}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${meta.name}，点击我的聊天`}
        hitSlop={5}
        onPress={() => onTalk(who, {
          x: x.get(),
          y: y.get()
        })}
      >
        <Animated.View style={facing}>
          <FarmPersonSprite
            who={who}
            activity={walking ? 'walk' : talking ? 'talk' : 'idle'}
            emotionPose={resolvedPose}
            size={22 * scale}
            active={active && !reducedMotion}
            walkSpeed={motion?.speed ?? 22}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}, (previous, next) => {
  const a = previous.resident, b = next.resident;
  return previous.scale === next.scale && previous.active === next.active &&
    previous.reducedMotion === next.reducedMotion && previous.followed === next.followed &&
    previous.sleepDeprived === next.sleepDeprived && previous.soloBadge === next.soloBadge &&
    previous.weatherBadge === next.weatherBadge && previous.weatherBadgeKind === next.weatherBadgeKind &&
    previous.emotionPose === next.emotionPose &&
    previous.emotionBadge === next.emotionBadge && previous.onTalk === next.onTalk &&
    a.id === b.id && a.motion === b.motion && a.state === b.state && a.face === b.face &&
    a.conversationPartner === b.conversationPartner && a.conversationSize === b.conversationSize &&
    a.task?.action.type === b.task?.action.type &&
    // The UI thread owns position while moving; logical ticks must not rerender sprites.
    (!!b.motion && !next.reducedMotion || a.logicalPosition.x === b.logicalPosition.x && a.logicalPosition.y === b.logicalPosition.y);
});

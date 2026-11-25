import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SCENE_SIZE, WAYPOINTS } from '@/constants/farmMap';
import type { FarmEmotionPose } from '@/utils/farmEmotion';
import { planFarmRoute } from '@/utils/farmNavigation';
import type { FarmWeather } from '@/utils/farmTown';
import {
  resolveVisitorDisplayProfile,
  visitorWeatherBehavior,
  type VisitorId,
  type WhaleVisitorSyncContext,
} from '@/utils/farmVisitors';
import { FarmText } from './FarmSkin';
import { FarmVisitorSprite } from './FarmVisitorSprite';

const WALK_SPEED = 22;

export const FarmVisitorActor = memo(function FarmVisitorActor({
  who,
  scale,
  active,
  weather = 'clear',
  rainbow = false,
  emotionPose = 'neutral',
  emotionBadge,
  whaleSync,
  onPress,
}: {
  who: VisitorId;
  scale: number;
  active: boolean;
  weather?: FarmWeather;
  rainbow?: boolean;
  emotionPose?: FarmEmotionPose;
  emotionBadge?: string;
  whaleSync?: WhaleVisitorSyncContext;
  onPress: (who: VisitorId, position: { x: number; y: number }) => void;
}) {
  const profile = useMemo(() => resolveVisitorDisplayProfile(who, whaleSync), [who, whaleSync]);
  const weatherBehavior = useMemo(
    () => visitorWeatherBehavior(who, weather, rainbow, whaleSync),
    [who, weather, rainbow, whaleSync],
  );
  const isHorror = who === 'dark_xushuiyin';
  const isDafeiyu = who === 'dafeiyu';
  const reducedMotion = useReducedMotion();
  const initialSpot = WAYPOINTS[weatherBehavior.waypoints[0]];

  const x = useSharedValue<number>(initialSpot.x);
  const y = useSharedValue<number>(initialSpot.y);
  const face = useSharedValue<number>(1);
  const pulse = useSharedValue<number>(0.4);

  const [activity, setActivity] = useState<'idle' | 'walk' | 'talk'>(isHorror ? 'talk' : 'idle');
  const [bubbleText, setBubbleText] = useState<string>(() =>
    isHorror ? weatherBehavior.ambientLines[0] : '',
  );
  const posRef = useRef<{ x: number; y: number }>({ x: initialSpot.x, y: initialSpot.y });
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!isHorror || reducedMotion || !active) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 680, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.28, { duration: 680, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [isHorror, reducedMotion, active, pulse]);

  useEffect(() => {
    const start = WAYPOINTS[weatherBehavior.waypoints[0]];
    cancelAnimation(x);
    cancelAnimation(y);
    x.set(start.x);
    y.set(start.y);
    posRef.current = { x: start.x, y: start.y };
  }, [who, weatherBehavior.waypoints, x, y]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
    const scheduleTimer = (fn: () => void, ms: number) => {
      const handle = setTimeout(() => {
        timers.current.delete(handle);
        fn();
      }, ms);
      timers.current.add(handle);
    };
    clearAll();
    if (!active) {
      cancelAnimation(x);
      cancelAnimation(y);
      return clearAll;
    }

    let stepIndex = 0;
    let lineIndex = 0;

    const scheduleLoop = () => {
      const pauseMs = isHorror ? 5200 : 6200 + (stepIndex % 3) * 1300;
      scheduleTimer(() => {
        const lines = weatherBehavior.ambientLines;
        const line = lines[lineIndex % lines.length];
        lineIndex += 1;
        setBubbleText(line);
        setActivity('talk');

        const talkMs = isHorror ? 3600 : 3200;
        scheduleTimer(() => {
          if (!isHorror) setBubbleText('');
          stepIndex += 1;
          const waypoints = weatherBehavior.waypoints;
          const nextWp = WAYPOINTS[waypoints[stepIndex % waypoints.length]];
          const route = planFarmRoute(posRef.current, nextWp);
          if (route.length === 0 || reducedMotion) {
            x.set(nextWp.x);
            y.set(nextWp.y);
            posRef.current = { x: nextWp.x, y: nextWp.y };
            setActivity('idle');
            scheduleLoop();
            return;
          }

          let prev = posRef.current;
          let totalDuration = 0;
          const segments = route.map(pt => {
            const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
            const dur = Math.max(80, Math.round((dist / WALK_SPEED) * 1000));
            prev = pt;
            totalDuration += dur;
            return { pt, dur };
          });

          setActivity('walk');
          x.set(withSequence(...segments.map(s => withTiming(s.pt.x, { duration: s.dur, easing: Easing.linear }))));
          y.set(withSequence(...segments.map(s => withTiming(s.pt.y, { duration: s.dur, easing: Easing.linear }))));

          scheduleTimer(() => {
            posRef.current = { x: nextWp.x, y: nextWp.y };
            setActivity(isHorror ? 'talk' : 'idle');
            scheduleLoop();
          }, totalDuration + 120);
        }, talkMs);
      }, pauseMs);
    };

    scheduleLoop();
    return () => {
      clearAll();
      cancelAnimation(x);
      cancelAnimation(y);
    };
  }, [active, isHorror, weather, rainbow, reducedMotion, x, y, weatherBehavior.ambientLines, weatherBehavior.waypoints]);

  useAnimatedReaction(
    () => x.get(),
    (cur, prev) => {
      if (prev !== null && Math.abs(cur - prev) > 0.15) {
        face.set(cur > prev ? 1 : -1);
      }
    },
  );

  const spriteSize = (isHorror ? 25 : 22) * scale;
  const positionStyle = useAnimatedStyle(() => ({
    zIndex: Math.round(y.get()) + (isHorror ? 3 : 0),
    transform: [
      { translateX: (x.get() - (isHorror ? 12.5 : 11)) * scale },
      { translateY: (y.get() - (isHorror ? 30 : 27.5)) * scale },
    ],
  }));

  const facingStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: face.get() }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const bubbleMaxW = Math.min(182, Math.max(126, SCENE_SIZE.width * scale * 0.46));
  const resolvedPose: FarmEmotionPose =
    activity !== 'idle'
      ? 'neutral'
      : isDafeiyu && (weather === 'rain' || rainbow)
        ? 'happy'
        : emotionPose;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: spriteSize,
          height: spriteSize * 1.25,
        },
        positionStyle,
      ]}
    >
      {bubbleText ? (
        <Pressable
          onPress={() => onPress(who, { x: x.get(), y: y.get() })}
          style={{
            position: 'absolute',
            bottom: spriteSize * 1.12,
            left: -(bubbleMaxW - spriteSize) / 2,
            width: bubbleMaxW,
            paddingHorizontal: 9,
            paddingVertical: 6,
            borderRadius: 11,
            backgroundColor: isHorror ? 'rgba(26, 12, 34, 0.94)' : isDafeiyu ? 'rgba(241, 249, 255, 0.96)' : 'rgba(255, 249, 236, 0.95)',
            borderWidth: 1.3,
            borderBottomWidth: 2.2,
            borderColor: isHorror ? '#C43D69' : isDafeiyu ? '#7BB6E6' : '#C9A87D',
            shadowColor: isHorror ? '#9E2A5C' : '#3B2816',
            shadowOpacity: isHorror ? 0.35 : 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 6,
            zIndex: 400,
          }}
        >
          <FarmText
            style={{
              color: isHorror ? '#FF87A8' : profile.accent,
              fontSize: 9.5,
              fontWeight: '800',
              marginBottom: 2,
            }}
          >
            {isHorror ? '⚠ 恐怖徐睡阴 · 疯狂打瓦中' : `访客 · ${profile.name}`}
          </FarmText>
          <FarmText
            numberOfLines={3}
            style={{
              color: isHorror ? '#F5E3F0' : '#533E29',
              fontSize: 10.5,
              lineHeight: 15,
            }}
          >
            {bubbleText}
          </FarmText>
        </Pressable>
      ) : null}

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: Math.max(-9, spriteSize * 0.24924 - 16),
          left: -56,
          right: -56,
          alignItems: 'center',
        }}
      >
        <FarmText
          variant="label"
          numberOfLines={1}
          style={{
            color: isHorror ? '#FFD0DF' : isDafeiyu ? '#1E5B8E' : '#3B5268',
            backgroundColor: isHorror ? 'rgba(44, 15, 48, 0.92)' : isDafeiyu ? 'rgba(224, 242, 255, 0.94)' : 'rgba(232, 242, 250, 0.92)',
            borderWidth: isHorror || isDafeiyu ? 1 : 0,
            borderColor: isHorror ? '#C43D69' : '#89C0EB',
            paddingHorizontal: 6,
            paddingVertical: 1,
            overflow: 'hidden',
            borderRadius: 7,
            fontSize: 10,
          }}
        >
          {emotionBadge && resolvedPose !== 'neutral' ? `${emotionBadge} ` : ''}
          {isHorror
            ? `恐怖徐睡阴 · ${weatherBehavior.badge ?? '闹觉中'}`
            : `访客·${profile.name}${weatherBehavior.badge ? ` · ${weatherBehavior.badge}` : ''}`}
        </FarmText>
      </View>

      {isHorror ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: -spriteSize * 0.22,
              top: spriteSize * 0.16,
              width: spriteSize * 1.44,
              height: spriteSize * 1.15,
              borderRadius: 999,
              backgroundColor: 'rgba(136, 42, 138, 0.34)',
              borderWidth: 1.5,
              borderColor: 'rgba(92, 224, 245, 0.5)',
            },
            glowStyle,
          ]}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${profile.name}，点击互动`}
        hitSlop={6}
        onPress={() => onPress(who, { x: x.get(), y: y.get() })}
      >
        <Animated.View style={facingStyle}>
          <FarmVisitorSprite
            who={who}
            activity={activity}
            emotionPose={resolvedPose}
            size={spriteSize}
            active={active && !reducedMotion}
            walkSpeed={WALK_SPEED}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

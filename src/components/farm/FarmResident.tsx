import { FarmText } from './FarmSkin';
import { memo, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import { remainingResidentMotion, type ResidentModel } from '@/utils/farmResidentAI';
import { FarmSpeechCard } from './FarmSpeechLayer';
import { FarmPersonSprite } from './FarmPersonSprite';

/** Display only: the central controller owns decisions, position and conversations. */
export const FarmResident = memo(function FarmResident({
  resident,
  scale,
  active,
  reducedMotion,
  onTalk
}: {
  resident: ResidentModel;
  scale: number;
  active: boolean;
  reducedMotion: boolean;
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
  useEffect(() => {
    cancelAnimation(x);
    cancelAnimation(y);
    if (!active) return;
    if (!motion || reducedMotion) {
      x.set(resident.logicalPosition.x);
      y.set(resident.logicalPosition.y);
      return;
    }
    const remaining = remainingResidentMotion(motion, Date.now());
    x.set(remaining.start.x);
    y.set(remaining.start.y);
    if (remaining.steps.length) {
      x.set(withDelay(Math.max(0, motion.startedAt - Date.now()), withSequence(...remaining.steps.map(s => withTiming(s.point.x, {
        duration: s.duration,
        easing: Easing.linear
      })))));
      y.set(withDelay(Math.max(0, motion.startedAt - Date.now()), withSequence(...remaining.steps.map(s => withTiming(s.point.y, {
        duration: s.duration,
        easing: Easing.linear
      })))));
    }
    return () => {
      cancelAnimation(x);
      cancelAnimation(y);
    };
    // Logical snapshots are for the game; an unchanged motion must not restart every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, active, reducedMotion, x, y]);
  useEffect(() => {
    face.set(resident.face);
  }, [resident.face, face]);
  useAnimatedReaction(() => x.get(), (current, previous) => {
    if (previous !== null && Math.abs(current - previous) > .01) face.set(current > previous ? 1 : -1);
  });
  const position = useAnimatedStyle(() => ({
    zIndex: resident.bubble ? 1500 : Math.round(y.get()),
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
  const walking = Boolean(motion) && active && !reducedMotion;
  const taskLabel = resident.task ? resident.task.action.type === 'fetch_water' ? '打水' : resident.task.action.type === 'water_crops' ? '浇水' : resident.task.action.type === 'talk_to' ? '找人' : resident.task.action.type === 'go_home' ? '回家' : resident.task.action.type === 'rest' ? '休息' : '散心' : '';
  return <Animated.View style={[{
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22 * scale,
    height: 28 * scale
  }, position]}>
    <View pointerEvents="none" style={{
      position: 'absolute',
      top: Math.max(-8, 22 * scale * 0.24924 - 16),
      left: -50,
      right: -50,
      alignSelf: 'center',
      alignItems: 'center',
    }}><FarmText variant="label" numberOfLines={1} style={{
      color: talking ? '#755538' : '#5B5138',
      backgroundColor: 'rgba(255,247,222,0.88)',
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
      borderRadius: 7,
      fontSize: 10
    }}>{meta.name}{taskLabel ? ` · ${taskLabel}` : talking ? ' ···' : ''}</FarmText></View>
    {resident.bubble ? <FarmSpeechCard resident={resident} scale={scale} x={x} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`${meta.name}，点击我的聊天`} hitSlop={5} onPress={() => onTalk(who, {
      x: x.get(),
      y: y.get()
    })}>
      <Animated.View style={facing}><FarmPersonSprite who={who} activity={walking ? 'walk' : talking ? 'talk' : 'idle'} size={22 * scale} active={active && !reducedMotion} walkSpeed={motion?.speed ?? 22} /></Animated.View>
    </Pressable>
  </Animated.View>;
});

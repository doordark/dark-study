import { memo, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import { remainingResidentMotion, type ResidentModel } from '@/utils/farmResidentAI';
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
  const face = useSharedValue<number>(resident.face),
    breath = useSharedValue(0);
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
      x.set(withSequence(...remaining.steps.map(s => withTiming(s.point.x, {
        duration: s.duration,
        easing: Easing.linear
      }))));
      y.set(withSequence(...remaining.steps.map(s => withTiming(s.point.y, {
        duration: s.duration,
        easing: Easing.linear
      }))));
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
  useEffect(() => {
    if (active && !reducedMotion) breath.set(withRepeat(withTiming(1, {
      duration: 1900 + meta.row * 120,
      easing: Easing.inOut(Easing.sin)
    }), -1, true));
    return () => cancelAnimation(breath);
  }, [active, reducedMotion, breath, meta.row]);
  const position = useAnimatedStyle(() => ({
    zIndex: Math.round(y.get()),
    transform: [{
      translateX: (x.get() - 11) * scale
    }, {
      translateY: (y.get() - 27.5) * scale - breath.get() * .5 * scale
    }]
  }));
  const facing = useAnimatedStyle(() => ({
    transform: [{
      scaleX: face.get()
    }]
  }));
  const talking = resident.state === 'talking';
  const walking = Boolean(motion) && active && !reducedMotion;
  const right = resident.logicalPosition.x > 100;
  const taskLabel = resident.task ? resident.task.action.type === 'fetch_water' ? '打水' : resident.task.action.type === 'water_crops' ? '浇水' : resident.task.action.type === 'talk_to' ? '找人' : resident.task.action.type === 'go_home' ? '回家' : resident.task.action.type === 'rest' ? '休息' : '散心' : '';
  return <Animated.View style={[{
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22 * scale,
    height: 28 * scale
  }, position]}>
    {resident.bubble ? <View pointerEvents="none" style={{
      position: 'absolute',
      bottom: 31 * scale,
      ...(right ? {
        right: 0
      } : {
        left: 0
      }),
      width: 136,
      padding: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#91A76B',
      backgroundColor: 'rgba(20,35,26,0.96)'
    }}><Text style={{
        color: '#F6EEDC',
        fontSize: 11,
        lineHeight: 17
      }}>{resident.bubble.text}</Text></View> : null}
    <Text pointerEvents="none" style={{
      position: 'absolute',
      top: -14,
      alignSelf: 'center',
      color: talking ? '#FFE6A1' : '#F6EEDC',
      backgroundColor: 'rgba(15,28,20,0.8)',
      paddingHorizontal: 5,
      borderRadius: 5,
      fontSize: 10
    }}>{meta.name}{taskLabel ? ` · ${taskLabel}` : talking ? ' ···' : ''}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${meta.name}，点击我的聊天`} hitSlop={5} onPress={() => onTalk(who, {
      x: x.get(),
      y: y.get()
    })}>
      <Animated.View style={facing}><FarmPersonSprite who={who} activity={walking ? 'walk' : talking ? 'talk' : 'idle'} size={22 * scale} active={active && !reducedMotion} positionX={x} positionY={y} walkSpeed={motion?.speed ?? 22} /></Animated.View>
    </Pressable>
  </Animated.View>;
});

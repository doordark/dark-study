import { memo, useEffect } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { POND } from '@/constants/farmMap';

/** One small animated water highlight layer; reeds/lilies belong to the pond sprite. */
export const FarmWater = memo(function FarmWater({ scale, night }: { scale: number; night: boolean }) {
  const ripple = useSharedValue(0);
  useEffect(() => {
    ripple.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(ripple);
  }, [ripple]);
  const style = useAnimatedStyle(() => ({ opacity: 0.2 + ripple.value * 0.3, transform: [{ translateX: ripple.value * scale }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: POND.x * scale, top: POND.y * scale, width: POND.w * scale, height: POND.h * scale, zIndex: POND.footY + 1 }, style]}>
    <Svg width={POND.w * scale} height={POND.h * scale} viewBox={`0 0 ${POND.w} ${POND.h}`}>
      <Path d="M24 24h7m14-3h8m-18 11h9m13 1h5" fill="none" stroke={night ? '#AEC6E9' : '#D7F7FF'} strokeWidth="0.45" />
    </Svg>
  </Animated.View>;
});

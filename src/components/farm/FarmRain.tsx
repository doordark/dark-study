import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useAnimationActive } from '@/hooks/useAnimationActive';

// One moving vector tile on the UI thread; no frame-by-frame React updates.
const streaks = Array.from({ length: 24 }, (_, i) => {
  const x = (i * 73) % 240, y = (i * 47) % 100;
  return `M${x},${y}l-3,10`;
}).join(' ');
const rainTile = Array.from({ length: 6 }, (_, tile) => streaks.replace(/M(\d+),(\d+)/g, (_, x, y) => `M${x},${Number(y) + tile * 100}`)).join(' ');
export function FarmRain({ width, height, active }: { width: number; height: number; active: boolean }) {
  const awake = useAnimationActive(active), reduced = useReducedMotion();
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.set(0);
    if (awake && !reduced) offset.set(withRepeat(withTiming(100, { duration: 650, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(offset);
  }, [awake, reduced, offset]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() * width / 200 }] }));
  if (!active || reduced) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1600 }}>
    <Animated.View style={[{ position: 'absolute', top: -width / 2, width, height: height + width }, style]}>
      <Svg width={width} height={height + width} viewBox="0 0 200 530" preserveAspectRatio="none"><Path d={rainTile} stroke="#D4EAF5" strokeWidth=".65" opacity=".46" /></Svg>
    </Animated.View>
  </View>;
}

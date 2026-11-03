import { memo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { BENCH, COOP, HOUSE, MARKET, POND, TREE } from '@/constants/farmMap';

const FACILITIES = [
  { id: 'house', rect: HOUSE, day: require('../../../assets/images/farm-house-v3.png'), night: require('../../../assets/images/farm-house-night-v3.png') },
  { id: 'coop', rect: COOP, day: require('../../../assets/images/farm-coop-v3.png'), night: require('../../../assets/images/farm-coop-night-v3.png') },
  { id: 'market', rect: MARKET, day: require('../../../assets/images/farm-market-v3.png'), night: require('../../../assets/images/farm-market-night-v3.png') },
  { id: 'pond', rect: POND, day: require('../../../assets/images/farm-pond-v3.png'), night: require('../../../assets/images/farm-pond-night-v3.png') },
  { id: 'bench', rect: BENCH, day: require('../../../assets/images/farm-bench-v3.png'), night: require('../../../assets/images/farm-bench-night-v3.png') },
  { id: 'tree', rect: TREE, day: require('../../../assets/images/farm-tree-v3.png'), night: require('../../../assets/images/farm-tree-night-v3.png') },
];

/** Sibling layers keep foot-based occlusion working across NPCs and the player.
 * Static ground details are merged into the background, not many SVG/View mounts. */
export const FarmSceneFacilities = memo(function FarmSceneFacilities({ scale, decorReady, dayStyle, nightStyle }: {
  scale: number; decorReady: boolean; dayStyle: AnimatedStyle<ViewStyle>; nightStyle: AnimatedStyle<ViewStyle>;
}) {
  return <>{FACILITIES.filter(f => decorReady || f.id !== 'tree').map(f => <View key={f.id} pointerEvents="none"
    style={{ position: 'absolute', left: f.rect.x * scale, top: f.rect.y * scale, width: f.rect.w * scale, height: f.rect.h * scale, zIndex: f.rect.footY }}>
    <Animated.View style={[StyleSheet.absoluteFill, dayStyle]}><Image source={f.day} fadeDuration={0} resizeMode="stretch" style={{ width: f.rect.w * scale, height: f.rect.h * scale }} /></Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, nightStyle]}><Image source={f.night} fadeDuration={0} resizeMode="stretch" style={{ width: f.rect.w * scale, height: f.rect.h * scale }} /></Animated.View>
  </View>)}</>;
});

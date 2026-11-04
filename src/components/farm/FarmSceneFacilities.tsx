import { memo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { BENCH, COOP, HOUSE, MARKET, POND, TREE } from '@/constants/farmMap';

const FACILITIES = [
  { id: 'house', rect: HOUSE, noon: require('../../../assets/images/farm-house-v3.png'), morning: require('../../../assets/images/farm-house-morning-v3.png'), evening: require('../../../assets/images/farm-house-evening-v3.png'), night: require('../../../assets/images/farm-house-night-v3.png') },
  { id: 'coop', rect: COOP, noon: require('../../../assets/images/farm-coop-v3.png'), morning: require('../../../assets/images/farm-coop-morning-v3.png'), evening: require('../../../assets/images/farm-coop-evening-v3.png'), night: require('../../../assets/images/farm-coop-night-v3.png') },
  { id: 'market', rect: MARKET, noon: require('../../../assets/images/farm-market-v3.png'), morning: require('../../../assets/images/farm-market-morning-v3.png'), evening: require('../../../assets/images/farm-market-evening-v3.png'), night: require('../../../assets/images/farm-market-night-v3.png') },
  { id: 'pond', rect: POND, noon: require('../../../assets/images/farm-pond-v3.png'), morning: require('../../../assets/images/farm-pond-morning-v3.png'), evening: require('../../../assets/images/farm-pond-evening-v3.png'), night: require('../../../assets/images/farm-pond-night-v3.png') },
  { id: 'bench', rect: BENCH, noon: require('../../../assets/images/farm-bench-v3.png'), morning: require('../../../assets/images/farm-bench-morning-v3.png'), evening: require('../../../assets/images/farm-bench-evening-v3.png'), night: require('../../../assets/images/farm-bench-night-v3.png') },
  { id: 'tree', rect: TREE, noon: require('../../../assets/images/farm-tree-v3.png'), morning: require('../../../assets/images/farm-tree-morning-v3.png'), evening: require('../../../assets/images/farm-tree-evening-v3.png'), night: require('../../../assets/images/farm-tree-night-v3.png') },
];

/** Sibling layers keep foot-based occlusion working across NPCs and the player.
 * Static ground details are merged into the background, not many SVG/View mounts. */
export const FarmSceneFacilities = memo(function FarmSceneFacilities({ scale, decorReady, dayStyle, nightStyle, period }: {
  scale: number; decorReady: boolean; dayStyle: AnimatedStyle<ViewStyle>; nightStyle: AnimatedStyle<ViewStyle>; period: 'morning' | 'noon' | 'evening' | 'night';
}) {
  return <>{FACILITIES.filter(f => decorReady || f.id !== 'tree').map(f => <View key={f.id} pointerEvents="none"
    style={{ position: 'absolute', left: f.rect.x * scale, top: f.rect.y * scale, width: f.rect.w * scale, height: f.rect.h * scale, zIndex: f.rect.footY }}>
    <Animated.View style={[StyleSheet.absoluteFill, dayStyle]}><Image source={f[period === 'night' ? 'noon' : period]} fadeDuration={0} resizeMode="contain" style={{ width: f.rect.w * scale, height: f.rect.h * scale }} /></Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, nightStyle]}><Image source={f.night} fadeDuration={0} resizeMode="contain" style={{ width: f.rect.w * scale, height: f.rect.h * scale }} /></Animated.View>
  </View>)}</>;
});

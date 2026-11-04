import type { ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

export type FarmTone = 'paper' | 'sage' | 'rose' | 'blue';
const rows: Record<FarmTone, number> = { paper: 0, sage: 1, rose: 2, blue: 3 };
export const FARM_INK = '#59432E';
export const FARM_BODY_FONT = Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui' });
const headingFont = Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' });

export function FarmText({ style, variant = 'body', ...props }: TextProps & { variant?: 'body' | 'title' | 'label' }) {
  return <Text {...props} style={[typography.base, typography[variant], style]} />;
}

const typography = StyleSheet.create({
  base: { color: FARM_INK, fontFamily: FARM_BODY_FONT },
  body: {},
  title: { fontFamily: headingFont, fontSize: 18, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: .25 },
});

const paper = {
  shop: require('../../../assets/images/farm-paper-shop.png'),
  journal: require('../../../assets/images/farm-paper-journal.png'),
  market: require('../../../assets/images/farm-paper-market.png'),
  residents: require('../../../assets/images/farm-paper-residents.png'),
  chat: require('../../../assets/images/farm-paper-chat.png'),
  bugs: require('../../../assets/images/farm-paper-bugs.png'),
  house: require('../../../assets/images/farm-paper-house.png'),
  night: require('../../../assets/images/farm-paper-night.png'),
};

export function FarmPaper({ theme }: { theme: keyof typeof paper }) {
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <Image source={paper[theme]} resizeMode="stretch" fadeDuration={0} style={{ width: '100%', height: '100%' }} />
  </View>;
}

/** One shared atlas, no SVG furniture or animated mounts for the interface. */
export function FarmFrame({ tone = 'paper' }: { tone?: FarmTone }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 3 }]}>
    <Image source={require('../../../assets/images/farm-ui-v3.png')} resizeMode="stretch" style={{ position: 'absolute', width: '100%', height: '400%', top: `${-rows[tone] * 100}%` }} />
  </View>;
}

export function FarmButton({ children, label, onPress, disabled, tone = 'sage', style }: {
  children?: ReactNode; label?: string; onPress: () => void; disabled?: boolean; tone?: FarmTone; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .48 : pressed ? .75 : 1, transform: [{ translateY: pressed ? 1 : 0 }] }, style]}>
    <FarmFrame tone={tone} />
    {children ?? <FarmText variant="label" style={{ fontSize: 12, textAlign: 'center' }}>{label}</FarmText>}
  </Pressable>;
}

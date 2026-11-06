import { AtlasSprite } from '@/components/AtlasSprite';
import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

export type FarmTone = 'paper' | 'sage' | 'rose' | 'blue';
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

const covers = {
  shop: require('../../../assets/images/farm-cover-shop.png'),
  journal: require('../../../assets/images/farm-cover-journal.png'),
  market: require('../../../assets/images/farm-cover-market.png'),
  chat: require('../../../assets/images/farm-cover-chat.png'),
  bugs: require('../../../assets/images/farm-cover-bugs.png'),
  house: require('../../../assets/images/farm-cover-house.png'),
};

export function FarmIllustration({ theme, compact = false }: { theme: keyof typeof covers; compact?: boolean }) {
  return <Image
    accessible={false}
    source={covers[theme]}
    resizeMode="contain"
    fadeDuration={0}
    style={{ width: compact ? 90 : '100%', aspectRatio: 150 / 44, maxWidth: 306, alignSelf: 'center', borderRadius: 8 }}
  />;
}

const iconColumns = { shop: 0, journal: 1, bugs: 2, residents: 3, water: 4, chat: 5, market: 6, house: 7 };

export function FarmFunctionIcon({ name, size = 22 }: { name: keyof typeof iconColumns; size?: number }) {
  return <AtlasSprite source={require('../../../assets/images/farm-function-icons.png')} columns={8} rows={1} column={iconColumns[name]} row={0} width={size} />;
}

export function FarmButton({ children, label, onPress, disabled, tone = 'sage', variant = 'soft', icon, style }: {
  children?: ReactNode; label?: string; onPress: () => void; disabled?: boolean; tone?: FarmTone; variant?: 'soft' | 'icon'; icon?: keyof typeof iconColumns; style?: StyleProp<ViewStyle>;
}) {
  const [bounds, setBounds] = useState({ width: 100, height: 44 });
  const fills = { paper: '#FFF7E5', sage: '#E1E8CF', rose: '#F4DFDF', blue: '#DDECF0' };
  return <Pressable onLayout={e => { const { width, height } = e.nativeEvent.layout; setBounds(previous => previous.width === width && previous.height === height ? previous : { width, height }); }} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPress={onPress}
    android_ripple={{ color: '#B9A58130' }}
    style={[{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: fills[tone], borderWidth: 1, borderColor: '#CFBE9E', borderBottomWidth: 2, borderRadius: variant === 'icon' ? 22 : 10, overflow: 'hidden', opacity: disabled ? .48 : 1 }, style]}>
    {variant === 'soft' ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><AtlasSprite source={require('../../../assets/images/farm-buttons-v7.png')} columns={2} rows={2} column={disabled || tone === 'sage' ? 1 : 0} row={disabled ? 1 : 0} width={bounds.width} height={bounds.height} /></View> : null}
    {icon ? <FarmFunctionIcon name={icon} /> : null}
    {children ?? <FarmText variant="label" numberOfLines={1} style={{ fontSize: 12, textAlign: 'center' }}>{label}</FarmText>}
  </Pressable>;
}

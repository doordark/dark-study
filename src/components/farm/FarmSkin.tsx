import { AtlasSprite } from '@/components/AtlasSprite';
import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

export type FarmTone = 'paper' | 'sage' | 'rose' | 'blue';
export const FARM_INK = '#59432E';
export const FARM_BODY_FONT = Platform.select({ ios: 'System', android: 'sans-serif', web: 'system-ui' });
const headingFont = Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' });
const SLOT_SKIN = require('../../../assets/images/farm-bag-slots-v6.png');
const SETTINGS_BTN_SKIN = require('../../../assets/images/farm-settings-btn.webp');
const PORTRAIT_FRAME_SKIN = require('../../../assets/images/farm-portrait-frame.webp');

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
  town: require('../../../assets/images/farm-cover-town.png'),
  group: require('../../../assets/images/farm-cover-group.png'),
  orchard: require('../../../assets/images/farm-residents-orchard.png'),
};

export function FarmIllustration({ theme, compact = false }: { theme: keyof typeof covers; compact?: boolean }) {
  const highResBanner = theme === 'town' || theme === 'group' || theme === 'journal' || theme === 'market' || theme === 'orchard';
  return (
    <View
      style={{
        width: compact ? 92 : '100%',
        maxWidth: compact ? 92 : 380,
        aspectRatio: theme === 'orchard' ? 600 / 220 : 150 / 44,
        alignSelf: 'center',
        borderRadius: compact ? 8 : 12,
        overflow: 'hidden',
        borderWidth: highResBanner ? 1.5 : 0,
        borderColor: '#D6BD94',
        backgroundColor: '#EFE3CA',
      }}
    >
      <Image
        accessible={false}
        source={covers[theme]}
        resizeMode={highResBanner ? 'cover' : 'contain'}
        fadeDuration={0}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

/** 复用 farm-bag-slots-v6 品质缝线木框：rarity 0=木棕 1=羊皮 2=天蓝 3=紫韵 4=暖金 5=彩光 */
export function FarmSlotFrame({
  size = 44,
  rarity = 1,
  selected = false,
  children,
  style,
}: {
  size?: number;
  rarity?: 0 | 1 | 2 | 3 | 4 | 5;
  selected?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <AtlasSprite
          source={SLOT_SKIN}
          columns={6}
          rows={2}
          column={rarity}
          row={selected ? 1 : 0}
          width={size}
          height={size}
        />
      </View>
      {children}
    </View>
  );
}

/** 农场顶栏专属设置按钮框（暖木配黄铜齿轮徽章，带轻按反馈与选中暖金微光） */
export function FarmSettingsButtonFrame({
  size = 38,
  active = false,
  pressed = false,
  style,
}: {
  size?: number;
  active?: boolean;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          opacity: pressed ? 0.9 : 1,
          boxShadow: active
            ? [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(232, 184, 87, 0.65)' }]
            : undefined,
        },
        style,
      ]}
    >
      <Image
        accessible={false}
        source={SETTINGS_BTN_SKIN}
        resizeMode="contain"
        fadeDuration={0}
        style={{ width: size, height: size }}
      />
      {active ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: 'rgba(232, 184, 87, 0.9)',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** 农场全员（居民 / 访客 / 摊主）统一暖色田园人物头像框 */
export function FarmPortraitFrame({
  size = 52,
  tone = 'warm',
  children,
  style,
}: {
  size?: number;
  tone?: 'warm' | 'horror';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const isHorror = tone === 'horror';
  const innerInset = Math.round(size * 0.1);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <Image
        accessible={false}
        source={PORTRAIT_FRAME_SKIN}
        resizeMode="contain"
        fadeDuration={0}
        style={{
          position: 'absolute',
          width: size,
          height: size,
          opacity: isHorror ? 0.85 : 1,
        }}
      />
      {isHorror ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: innerInset,
            right: innerInset,
            top: innerInset,
            bottom: innerInset,
            borderRadius: Math.round(size * 0.14),
            backgroundColor: 'rgba(34, 15, 48, 0.78)',
            borderWidth: 1,
            borderColor: 'rgba(214, 79, 125, 0.55)',
          }}
        />
      ) : null}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

export function FarmParchmentCard({
  children,
  tone = 'cream',
  style,
}: {
  children?: ReactNode;
  tone?: 'cream' | 'sage' | 'warm';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'sage' ? '#EDF2E1' : tone === 'warm' ? '#F6EADB' : '#FAF2E3';
  const border = tone === 'sage' ? '#C4D4AB' : tone === 'warm' ? '#D9C09D' : '#DEC8A6';
  return (
    <View
      style={[
        {
          padding: 12,
          borderRadius: 14,
          backgroundColor: bg,
          borderWidth: 1.2,
          borderBottomWidth: 2.2,
          borderColor: border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
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

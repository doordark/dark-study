import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { FarmPortraitFrame, FarmText } from './FarmSkin';

/** 居民 / 商贩对话面板共用的底色、描边与文字色 */
export const FARM_NPC_SURFACE = '#FFF7ED';
const LINE = '#E6D7BD';
const INK = '#59432E';
const SUB = '#8A785E';

export type FarmNPCBadgeTone = 'rain' | 'rainbow' | 'online' | 'muted';
export interface FarmNPCBadge {
  label: string;
  tone: FarmNPCBadgeTone;
}

const BADGE_COLORS: Record<FarmNPCBadgeTone, { bg: string; fg: string }> = {
  rain: { bg: '#E1EEF9', fg: '#2F638C' },
  rainbow: { bg: '#FDF0D1', fg: '#9C6219' },
  online: { bg: 'rgba(143,209,79,0.18)', fg: '#5F7749' },
  muted: { bg: '#F1E5CC', fg: SUB },
};

/** 统一的人物面板头部：头像框 + 名字 + 心情/好感 + 状态徽章 + 右侧操作 + 关闭 */
export function FarmNPCHeader({
  portrait,
  name,
  meta,
  badges = [],
  actions,
  onClose,
}: {
  portrait: ReactNode;
  name: string;
  meta: string;
  badges?: readonly FarmNPCBadge[];
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 10 }}>
      <FarmPortraitFrame size={52}>
        {portrait}
      </FarmPortraitFrame>
      <View style={{ flex: 1, minWidth: 0 }}>
        <FarmText variant="title" numberOfLines={1} style={{ color: INK, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 }}>
          {name}
        </FarmText>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
          <FarmText style={{ fontSize: 10.5, color: SUB }}>{meta}</FarmText>
          {badges.map(badge => (
            <View
              key={badge.label}
              style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 99, backgroundColor: BADGE_COLORS[badge.tone].bg }}
            >
              <FarmText style={{ color: BADGE_COLORS[badge.tone].fg, fontSize: 9, fontWeight: '700' }}>{badge.label}</FarmText>
            </View>
          ))}
        </View>
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{actions}</View> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭人物面板"
        onPress={onClose}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? '#EADCC2' : '#F3E8D3',
          borderWidth: 1,
          borderColor: LINE,
        })}
      >
        <Ionicons name="close" size={16} color={SUB} />
      </Pressable>
    </View>
  );
}

/** 头部右侧的小胶囊操作（送礼 / 记忆本 …） */
export function FarmHeaderAction({
  icon,
  label,
  active = false,
  tone = 'amber',
  accessibilityLabel,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  tone?: 'amber' | 'sage';
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const on = tone === 'amber' ? { bg: '#F8E6CC', border: '#D59D53', fg: '#7D5224' } : { bg: '#DFE7CE', border: '#A7AF89', fg: '#55683E' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 30,
        paddingHorizontal: 9,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: active ? on.bg : '#F5ECD8',
        borderWidth: 1,
        borderColor: active ? on.border : LINE,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
      <FarmText style={{ color: on.fg, fontSize: 10.5, fontWeight: '700' }}>{label}</FarmText>
    </Pressable>
  );
}

/** 与居民对话一致的胶囊分段标签（商贩：购买 / 委托 / 出售 / 工坊 / 图鉴 / 对话） */
export function FarmSegmentTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly (readonly [T, string])[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        marginHorizontal: 14,
        marginBottom: 4,
        padding: 3,
        gap: 3,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: '#F1E6D2',
        borderWidth: 1,
        borderColor: LINE,
      }}
    >
      {items.map(([id, label]) => {
        const selected = id === value;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(id)}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 13,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? '#FFFCF5' : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: '#E2CFAE',
              boxShadow: selected ? [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(89,67,46,0.14)' }] : undefined,
            }}
          >
            <FarmText
              numberOfLines={1}
              style={{ fontSize: 12, fontWeight: selected ? '800' : '600', color: selected ? INK : SUB }}
            >
              {label}
            </FarmText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 快捷话题胶囊行（与农场居民对话的话题卡同款） */
export function FarmTopicChips({
  topics,
  disabled = false,
  onPick,
}: {
  topics: readonly string[];
  disabled?: boolean;
  onPick: (topic: string) => void;
}) {
  const [pressedTopic, setPressedTopic] = useState<string | null>(null);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 7, paddingHorizontal: 14, paddingVertical: 9 }}
    >
      {topics.map(topic => (
        <Pressable
          key={topic}
          disabled={disabled}
          onPress={() => onPick(topic)}
          onPressIn={() => setPressedTopic(topic)}
          onPressOut={() => setPressedTopic(null)}
          style={{
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: '#D7C6A6',
            backgroundColor: pressedTopic === topic ? '#EDE1C9' : '#F5ECD8',
            opacity: disabled ? 0.45 : 1,
          }}
        >
          <FarmText style={{ color: '#6B573E', fontSize: 10.5 }}>{topic}</FarmText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

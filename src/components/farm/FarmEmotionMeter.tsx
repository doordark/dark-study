import { memo } from 'react';
import { View } from 'react-native';
import {
  describeFarmEmotion,
  type FarmEmotionState,
} from '@/utils/farmEmotion';
import { FarmText as Text } from './FarmSkin';

const DIMS: {
  key: 'joy' | 'energy' | 'calm' | 'social';
  label: string;
  color: string;
}[] = [
  { key: 'joy', label: '愉悦', color: '#E09A34' },
  { key: 'energy', label: '精力', color: '#58965A' },
  { key: 'calm', label: '平和', color: '#4E86A8' },
  { key: 'social', label: '社交', color: '#B4698A' },
];

/** 紧凑 4 维数值情绪卡（支持极简行模式与完整数值条模式） */
export const FarmEmotionMeter = memo(function FarmEmotionMeter({
  emotion,
  compact = false,
}: {
  emotion: FarmEmotionState;
  compact?: boolean;
}) {
  const desc = describeFarmEmotion(emotion);

  if (compact) {
    return (
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 99,
              backgroundColor: desc.bg,
              borderWidth: 1,
              borderColor: `${desc.color}44`,
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: desc.color }}>
              {desc.badge} {desc.label}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: '#7D6A52' }}>
            愉悦 {emotion.joy} · 精力 {emotion.energy} · 平和 {emotion.calm} · 社交 {emotion.social}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DIMS.map(dim => (
            <View key={dim.key} style={{ flex: 1, gap: 2 }}>
              <View
                style={{
                  height: 4,
                  borderRadius: 99,
                  backgroundColor: '#E5D8C2',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.max(4, emotion[dim.key])}%`,
                    height: '100%',
                    borderRadius: 99,
                    backgroundColor: dim.color,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        padding: 10,
        borderRadius: 14,
        backgroundColor: '#FAF2E1',
        borderWidth: 1,
        borderColor: '#E4D4B7',
        gap: 7,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 99,
              backgroundColor: desc.bg,
              borderWidth: 1,
              borderColor: `${desc.color}44`,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: desc.color }}>
              {desc.badge} {desc.label}
            </Text>
          </View>
          {emotion.reason ? (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: '#7D6A52' }}>
              因：{emotion.reason}
            </Text>
          ) : (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: '#8A785E' }}>
              {desc.toneHint}
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DIMS.map(dim => {
          const val = emotion[dim.key];
          return (
            <View key={dim.key} style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 9.5, color: '#7D6A52', fontWeight: '700' }}>{dim.label}</Text>
                <Text style={{ fontSize: 9.5, color: dim.color, fontWeight: '800' }}>{val}</Text>
              </View>
              <View
                style={{
                  height: 5,
                  borderRadius: 99,
                  backgroundColor: '#E7DAC3',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.max(5, val)}%`,
                    height: '100%',
                    borderRadius: 99,
                    backgroundColor: dim.color,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

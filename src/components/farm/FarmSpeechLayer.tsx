import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { SCENE_SIZE } from '@/constants/farmMap';
import { RESIDENTS } from '@/utils/farmLife';
import type { ResidentModel } from '@/utils/farmResidentAI';
import { FarmText } from './FarmSkin';

export const FarmSpeechCard = memo(function FarmSpeechCard({ resident: r, scale, x }: {
  resident: ResidentModel; scale: number; x: SharedValue<number>;
}) {
  const cardWidth = Math.min(SCENE_SIZE.width * scale - 12, 204);
  const style = useAnimatedStyle(() => {
    const center = x.get() * scale;
    const left = Math.max(6, Math.min(SCENE_SIZE.width * scale - cardWidth - 6, center - cardWidth / 2));
    return { transform: [{ translateX: left - center + 11 * scale }] };
  });
  const partner = r.conversationPartner;
  const message = r.bubble?.text;
  if (!message) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, bottom: 28 * scale + 22, width: cardWidth, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFF9EC', borderWidth: 1, borderColor: '#CBAE88', borderRadius: 12 }, style]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <View style={{ width: 5, height: 5, backgroundColor: '#BD8972', transform: [{ rotate: '45deg' }] }} />
          <FarmText variant="label" numberOfLines={1} style={{ flex: 1, color: '#825064' }}>
            {RESIDENTS[r.id].name}{r.conversationSize > 2 ? ' · 大家一起聊' : partner ? ` · 与${RESIDENTS[partner].name}闲聊` : ''}
          </FarmText>
        </View>
        <FarmText style={{ color: '#493A2C', fontSize: 13, lineHeight: 19 }}>{message}</FarmText>

  </Animated.View>;
});

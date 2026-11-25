import { memo, useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SCENE_SIZE, type FarmPoint } from '@/constants/farmMap';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import type { ResidentModel } from '@/utils/farmResidentAI';
import {
  layoutFarmSpeechBubbles,
  type PlacedSpeechBubble,
  type SpeechBubbleActorBox,
  type SpeechBubbleInput,
} from '@/utils/farmResidentSpace';
import { FarmText } from './FarmSkin';

const SPEAKER_ACCENTS: Record<ResidentId, string> = {
  door: '#5E7D45',
  gu: '#A65D78',
  xiaoba: '#527C9F',
  yujie: '#9B7437',
  weigang: '#87639B',
  chicken: '#85763F',
};

function BubbleTail({ placed }: { placed: PlacedSpeechBubble }) {
  const size = 8;
  const common = {
    position: 'absolute' as const,
    width: size,
    height: size,
    backgroundColor: '#FFF9EC',
    borderColor: '#CBAE88',
    transform: [{ rotate: '45deg' }],
  };
  if (placed.tail === 'bottom') {
    return (
      <View
        style={[
          common,
          {
            bottom: -size / 2,
            left: placed.tailOffset - size / 2,
            borderRightWidth: 1,
            borderBottomWidth: 1,
          },
        ]}
      />
    );
  }
  if (placed.tail === 'top') {
    return (
      <View
        style={[
          common,
          {
            top: -size / 2,
            left: placed.tailOffset - size / 2,
            borderLeftWidth: 1,
            borderTopWidth: 1,
          },
        ]}
      />
    );
  }
  if (placed.tail === 'left') {
    return (
      <View
        style={[
          common,
          {
            left: -size / 2,
            top: placed.tailOffset - size / 2,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
          },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        common,
        {
          right: -size / 2,
          top: placed.tailOffset - size / 2,
          borderRightWidth: 1,
          borderTopWidth: 1,
        },
      ]}
    />
  );
}

const AnimatedSpeechBubble = memo(function AnimatedSpeechBubble({
  placed,
  resident,
  message,
  onPress,
}: {
  placed: PlacedSpeechBubble;
  resident: ResidentModel;
  message: string;
  onPress?: (resident: ResidentModel) => void;
}) {
  const reducedMotion = useReducedMotion();
  const left = useSharedValue(placed.left);
  const top = useSharedValue(placed.top);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: reducedMotion ? 0 : 160, easing: Easing.out(Easing.quad) });
  }, [opacity, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      left.value = placed.left;
      top.value = placed.top;
    } else {
      left.value = withTiming(placed.left, { duration: 220, easing: Easing.out(Easing.cubic) });
      top.value = withTiming(placed.top, { duration: 220, easing: Easing.out(Easing.cubic) });
    }
  }, [placed.left, placed.top, left, top, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: left.value }, { translateY: top.value }],
  }));

  const partner = resident.conversationPartner;
  const accent = SPEAKER_ACCENTS[resident.id];
  const isThought = resident.bubble?.kind === 'thought';
  const isGroupOrPair = !isThought && resident.conversationSize >= 2;
  const title = isThought
    ? `${RESIDENTS[resident.id].name} · 心想`
    : RESIDENTS[resident.id].name +
      (resident.conversationSize > 2
        ? ` · 大家一起聊 (${resident.conversationSize}人)`
        : partner
          ? ` · 与${RESIDENTS[partner].name}聊天`
          : '');

  const cardBody = (
    <View
      style={{
        width: placed.width,
        paddingHorizontal: 11,
        paddingVertical: 7,
        backgroundColor: isThought ? 'rgba(250,245,234,0.96)' : '#FFF9EC',
        borderWidth: 1.2,
        borderBottomWidth: isThought ? 1.5 : 2.2,
        borderStyle: isThought ? 'dashed' : 'solid',
        borderColor: isThought ? '#C7B59B' : '#C8A97F',
        borderRadius: isThought ? 15 : 12,
        shadowColor: '#3B2816',
        shadowOpacity: isThought ? 0.1 : 0.16,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: isThought ? 2 : 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        {isThought ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: '#B39B7E' }} />
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#9C8263' }} />
            <View style={{ width: 6.5, height: 6.5, borderRadius: 3.5, backgroundColor: '#8A6F50' }} />
          </View>
        ) : (
          <View style={{ width: 5, height: 5, backgroundColor: accent, transform: [{ rotate: '45deg' }] }} />
        )}
        <FarmText variant="label" numberOfLines={1} style={{ flex: 1, color: isThought ? '#7A6852' : accent, fontSize: 10.5 }}>
          {title}
        </FarmText>
        {onPress && isGroupOrPair ? (
          <FarmText style={{ color: '#6E7F53', fontSize: 9.5, fontWeight: '700' }}>加入 ›</FarmText>
        ) : onPress && isThought ? (
          <FarmText style={{ color: '#8A785E', fontSize: 9.5 }}>搭话 ›</FarmText>
        ) : null}
      </View>
      <FarmText style={{ color: isThought ? '#635340' : '#493A2C', fontSize: 12.5, lineHeight: 18.5 }}>{message}</FarmText>
      {!isThought ? <BubbleTail placed={placed} /> : null}
    </View>
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, animStyle]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isGroupOrPair ? `加入${RESIDENTS[resident.id].name}的群聊` : `和${RESIDENTS[resident.id].name}聊天`}
          onPress={() => onPress(resident)}
        >
          {cardBody}
        </Pressable>
      ) : (
        cardBody
      )}
    </Animated.View>
  );
});

/**
 * 全局防重叠、防越界、防遮挡人物的气泡覆盖层：
 * 独立渲染在所有人物之上（zIndex: 2000），支持平滑跟随、顶部安全区避让与点击直达加入群聊。
 */
export const FarmSpeechOverlay = memo(function FarmSpeechOverlay({
  residents,
  scale,
  playerPosition,
  topBlockedHeight = 0,
  onPressBubble,
}: {
  residents: readonly ResidentModel[];
  scale: number;
  playerPosition?: FarmPoint;
  topBlockedHeight?: number;
  onPressBubble?: (resident: ResidentModel) => void;
}) {
  const width = SCENE_SIZE.width * scale;
  const height = SCENE_SIZE.height * scale;
  const cardWidth = Math.min(width - 12, Math.max(156, Math.min(212, width * 0.56)));

  const placedList = useMemo(() => {
    const active = residents.filter(r => r.bubble?.text);
    if (!active.length) return [];

    const actors: SpeechBubbleActorBox[] = residents.map(r => {
      const footX = r.logicalPosition.x * scale;
      const footY = r.logicalPosition.y * scale;
      const spriteW = 22 * scale;
      const spriteH = 28 * scale + 16;
      return {
        id: r.id,
        footX,
        footY,
        left: footX - spriteW / 2,
        top: footY - spriteH,
        width: spriteW,
        height: spriteH,
      };
    });

    if (playerPosition) {
      const footX = playerPosition.x * scale;
      const footY = playerPosition.y * scale;
      const spriteW = 22 * scale;
      const spriteH = 28 * scale + 16;
      actors.push({
        id: 'player',
        footX,
        footY,
        left: footX - spriteW / 2,
        top: footY - spriteH,
        width: spriteW,
        height: spriteH,
      });
    }

    const inputs: SpeechBubbleInput[] = active.map((r, index) => ({
      id: r.id,
      speakerId: r.id,
      anchorX: r.logicalPosition.x * scale,
      anchorY: r.logicalPosition.y * scale - 28 * scale - 14,
      footY: r.logicalPosition.y * scale,
      text: r.bubble!.text,
      priority: (r.bubble!.createdAt ?? 0) + (r.conversationSize > 0 ? 1000 : 0) + index,
    }));

    return layoutFarmSpeechBubbles(
      inputs,
      {
        width,
        height,
        topSafe: Math.max(10, 14 * scale, topBlockedHeight),
        bottomSafe: Math.max(10, 8 * scale),
      },
      actors,
      cardWidth,
    );
  }, [residents, scale, playerPosition, topBlockedHeight, width, height, cardWidth]);

  if (!placedList.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        zIndex: 2000,
      }}
    >
      {placedList.map(placed => {
        const resident = residents.find(r => r.id === placed.id);
        const message = resident?.bubble?.text;
        if (!resident || !message) return null;
        return (
          <AnimatedSpeechBubble
            key={placed.id}
            placed={placed}
            resident={resident}
            message={message}
            onPress={onPressBubble}
          />
        );
      })}
    </View>
  );
});

/** Retained for compatibility with isolated previews. Live scene bubbles render via FarmSpeechOverlay. */
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
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, bottom: 28 * scale + 22, width: cardWidth, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFF9EC', borderWidth: 1, borderColor: '#CBAE88', borderRadius: 12 }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <View style={{ width: 5, height: 5, backgroundColor: '#BD8972', transform: [{ rotate: '45deg' }] }} />
        <FarmText variant="label" numberOfLines={1} style={{ flex: 1, color: '#825064' }}>
          {RESIDENTS[r.id].name}{r.conversationSize > 2 ? ` · 大家一起聊 (${r.conversationSize}人)` : partner ? ` · 与${RESIDENTS[partner].name}闲聊` : ''}
        </FarmText>
      </View>
      <FarmText style={{ color: '#493A2C', fontSize: 13, lineHeight: 19 }}>{message}</FarmText>
    </Animated.View>
  );
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, type ComponentRef, type Ref } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import {
  CROP_KINDS,
  CROP_LABELS,
  RECIPES,
  type CropKind,
  type Recipe,
} from '@/utils/farmEconomy';
import { unwrapFarmReplyText } from '@/utils/farmMemory';
import { ChatMessageList } from '../ChatMessageList';
import { CropSprite, FarmDishSprite, FarmUiIcon } from './CropSprite';
import { FARM_BODY_FONT, FarmSlotFrame, FarmText } from './FarmSkin';

export interface FarmChatGiftCard {
  kind: 'gift' | 'wish';
  itemLabel: string;
  itemId?: CropKind | Recipe['id'];
  quantity?: number;
  recipientName?: string;
  tier?: 'loved' | 'liked' | 'normal';
  affinityDelta?: number;
  rewardLabel?: string;
  inventoryConsumed?: boolean;
}

export type FarmChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** 仅真实背包扣减送礼事件可携带的结构化系统卡片信息 */
  gift?: FarmChatGiftCard;
};

type EnrichedFarmChatMessage = FarmChatMessage & {
  displayText: string;
  verifiedGift: FarmChatGiftCard | null;
};

const CROP_LABEL_TO_ID = new Map<string, CropKind>(
  CROP_KINDS.map(kind => [CROP_LABELS[kind], kind]),
);
const RECIPE_LABEL_TO_ID = new Map<string, Recipe['id']>(
  RECIPES.map(recipe => [recipe.label, recipe.id]),
);

function isCropId(id?: string): id is CropKind {
  return typeof id === 'string' && id in CROP_LABELS;
}

function isRecipeId(id?: string): id is Recipe['id'] {
  return typeof id === 'string' && RECIPES.some(recipe => recipe.id === id);
}

export function resolveGiftItemId(label: string): CropKind | Recipe['id'] | undefined {
  const clean = label.trim();
  return CROP_LABEL_TO_ID.get(clean) ?? RECIPE_LABEL_TO_ID.get(clean);
}

/**
 * 识别真实系统送礼卡片（彻底防聊天框口头伪造）：
 * 1. 优先识别显式结构化 `message.gift` 字段；
 * 2. 兼容已有系统送礼文案，但必须存在系统配对回复 ID（`-gift` / `-wish` / `-vg`）或系统送礼消息 ID，
 *    玩家在聊天框手动输入“送你一个萝卜”甚至“（送给你一份萝卜）”都不会被渲染为真实送礼卡片。
 */
export function parseVerifiedGiftCard(
  message: FarmChatMessage,
  nextMessage?: FarmChatMessage,
): FarmChatGiftCard | null {
  if (message.gift && message.gift.itemLabel.trim()) {
    const itemLabel = message.gift.itemLabel.trim();
    return {
      ...message.gift,
      itemLabel,
      itemId: message.gift.itemId ?? resolveGiftItemId(itemLabel),
      quantity: Math.max(1, Math.round(message.gift.quantity ?? 1)),
      inventoryConsumed: message.gift.inventoryConsumed ?? true,
    };
  }

  if (message.role !== 'user') return null;

  const hasSystemPair = nextMessage?.role === 'assistant' && /(?:-gift|-wish|-vg)$/.test(nextMessage.id);
  const hasSystemId = /(?:^gift-|[-_]gift$|^wish-|[-_]wish$|^vg-|[-_]vg$)/.test(message.id);
  if (!hasSystemPair && !hasSystemId) return null;

  const trimmed = message.text.trim();

  const wishMatch = /^（帮你实现心愿：送来\s*(\d+)\s*份([^（）]{1,16})）$/.exec(trimmed);
  if (wishMatch) {
    const itemLabel = wishMatch[2].trim();
    const itemId = resolveGiftItemId(itemLabel);
    if (itemId) {
      return {
        kind: 'wish',
        itemLabel,
        itemId,
        quantity: Math.max(1, Number(wishMatch[1]) || 1),
        inventoryConsumed: true,
      };
    }
  }

  const visitorGiftMatch = /^（送给来串门的([^（）]{1,16})一份([^（）]{1,16})）$/.exec(trimmed);
  if (visitorGiftMatch) {
    const recipientName = visitorGiftMatch[1].trim();
    const itemLabel = visitorGiftMatch[2].trim();
    const itemId = resolveGiftItemId(itemLabel);
    if (itemId) {
      return {
        kind: 'gift',
        recipientName,
        itemLabel,
        itemId,
        quantity: 1,
        inventoryConsumed: true,
      };
    }
  }

  const residentGiftMatch = /^（送给你一份([^（）]{1,16})）$/.exec(trimmed);
  if (residentGiftMatch) {
    const itemLabel = residentGiftMatch[1].trim();
    const itemId = resolveGiftItemId(itemLabel);
    if (itemId) {
      return {
        kind: 'gift',
        itemLabel,
        itemId,
        quantity: 1,
        inventoryConsumed: true,
      };
    }
  }

  return null;
}

const FarmGiftCardRow = memo(function FarmGiftCardRow({ card }: { card: FarmChatGiftCard }) {
  const isWish = card.kind === 'wish';
  const qty = Math.max(1, card.quantity ?? 1);
  const rarity: 2 | 4 = isWish || card.tier === 'loved' ? 4 : 2;
  const titleText = isWish
    ? `实现今日心愿 · 递出「${card.itemLabel}」×${qty}`
    : card.recipientName
      ? `向${card.recipientName}递出「${card.itemLabel}」×${qty}`
      : `从背包递出「${card.itemLabel}」×${qty}`;

  return (
    <View style={{ alignItems: 'center', paddingVertical: 2 }}>
      <View
        style={{
          width: '94%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 11,
          paddingVertical: 9,
          borderRadius: 14,
          backgroundColor: isWish ? '#ECF4E1' : '#FDF2DD',
          borderWidth: 1.2,
          borderBottomWidth: 2,
          borderColor: isWish ? '#B9CF97' : '#DFBD85',
        }}
      >
        <FarmSlotFrame size={40} rarity={rarity} selected>
          {isCropId(card.itemId) ? (
            <CropSprite kind={card.itemId} size={26} />
          ) : isRecipeId(card.itemId) ? (
            <FarmDishSprite kind={card.itemId} size={30} />
          ) : (
            <FarmUiIcon name={isWish ? 'wish' : 'gift'} size={22} />
          )}
        </FarmSlotFrame>

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1.5,
                borderRadius: 99,
                backgroundColor: isWish ? '#688B44' : '#C57B2B',
              }}
            >
              <FarmText style={{ color: '#FFFDF7', fontSize: 9, fontWeight: '800' }}>
                {isWish ? '心愿实送' : '真实送礼'}
              </FarmText>
            </View>
            {card.inventoryConsumed !== false ? (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 99,
                  backgroundColor: isWish ? '#DAE9C6' : '#F2E0BC',
                }}
              >
                <FarmText style={{ color: isWish ? '#44602C' : '#7E5523', fontSize: 9, fontWeight: '700' }}>
                  已扣背包
                </FarmText>
              </View>
            ) : null}
            {card.tier === 'loved' ? (
              <View
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 1.5,
                  borderRadius: 99,
                  backgroundColor: '#F9DFB1',
                }}
              >
                <FarmText style={{ color: '#995712', fontSize: 9, fontWeight: '800' }}>★ 最爱</FarmText>
              </View>
            ) : null}
            {typeof card.affinityDelta === 'number' && card.affinityDelta > 0 ? (
              <FarmText style={{ color: isWish ? '#4B6B30' : '#9B5F1E', fontSize: 9.5, fontWeight: '800' }}>
                好感 +{card.affinityDelta}
              </FarmText>
            ) : null}
          </View>

          <FarmText style={{ color: isWish ? '#3B5227' : '#583E21', fontSize: 12.5, fontWeight: '800', lineHeight: 18 }}>
            {titleText}
          </FarmText>

          {card.rewardLabel ? (
            <FarmText style={{ color: '#7D6344', fontSize: 10 }}>
              回礼：{card.rewardLabel}
            </FarmText>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const FarmMessageRow = memo(function FarmMessageRow({ message }: { message: EnrichedFarmChatMessage }) {
  if (message.verifiedGift) {
    return <FarmGiftCardRow card={message.verifiedGift} />;
  }
  const mine = message.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '84%',
          borderRadius: 16,
          borderBottomRightRadius: mine ? 5 : 16,
          borderBottomLeftRadius: mine ? 16 : 5,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: mine ? '#E2E8CC' : '#F7EADF',
          borderWidth: 1,
          borderColor: mine ? '#D0DAB3' : '#EBDACB',
        }}
      >
        <FarmText style={{ color: mine ? '#435532' : '#59432E', fontSize: 13, lineHeight: 20 }}>
          {message.displayText}
        </FarmText>
      </View>
    </View>
  );
});

function TypingDot({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 }), withTiming(0, { duration: 280 })), -1, false));
    return () => cancelAnimation(t);
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.65, transform: [{ translateY: -t.value * 3 }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#A48B68' }, style]} />;
}

function TypingBubble() {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View
        accessibilityLabel="对方正在输入"
        style={{ flexDirection: 'row', gap: 4, alignItems: 'center', borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#F7EADF', borderWidth: 1, borderColor: '#EBDACB' }}
      >
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
    </View>
  );
}

export function FarmChatConversation({ messages, busy, value, onChange, onSend, placeholder, maxHeight, hint, inputRef }: {
  messages: FarmChatMessage[]; busy: boolean; value: string; onChange: (value: string) => void;
  onSend: () => void; placeholder: string; maxHeight: number; hint?: string;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const enrichedMessages = useMemo<EnrichedFarmChatMessage[]>(
    () =>
      messages.map((msg, index) => {
        const verifiedGift = parseVerifiedGiftCard(msg, messages[index + 1]);
        const displayText = msg.role === 'assistant'
          ? (unwrapFarmReplyText(msg.text) || msg.text.trim())
          : msg.text;
        return { ...msg, displayText, verifiedGift };
      }),
    [messages],
  );

  const renderMessage = useCallback(
    (message: EnrichedFarmChatMessage) => <FarmMessageRow message={message} />,
    [],
  );

  return <>
    <ChatMessageList messages={enrichedMessages} renderMessage={renderMessage} maxHeight={maxHeight}
      header={busy ? <TypingBubble /> : null} />
    {hint ? <FarmText style={{ paddingHorizontal: 14, color: '#8A785E', fontSize: 9.5 }}>{hint}</FarmText> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 6, marginBottom: 10, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 24, backgroundColor: '#F4EADC', borderWidth: 1, borderColor: '#E6D7BD' }}>
      <TextInput ref={inputRef} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9A896C" style={{ fontFamily: FARM_BODY_FONT, flex: 1, height: 44, minWidth: 0, paddingHorizontal: 10, color: '#59432E', fontSize: 13 }} maxLength={200} returnKeyType="send" editable={!busy} onSubmitEditing={onSend} />
      <Pressable accessibilityLabel="发送消息" onPress={onSend} disabled={!value.trim() || busy} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: !value.trim() || busy ? '#DCE3CB' : '#A4B887' }}><Ionicons name="arrow-up" size={18} color="#435532" /></Pressable>
    </View>
  </>;
}

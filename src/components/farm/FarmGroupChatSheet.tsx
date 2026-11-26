import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatMessageList } from '../ChatMessageList';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from '@/utils/farmLife';
import type { FarmGroupMessage } from '@/utils/farmGroupChat';
import { FarmUiIcon } from './CropSprite';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FARM_BODY_FONT, FarmIllustration, FarmSlotFrame, FarmText } from './FarmSkin';

const MEMBER_COLORS: Record<ResidentId, string> = {
  door: '#5E7D45',
  gu: '#A65D78',
  xiaoba: '#527C9F',
  yujie: '#9B7437',
  weigang: '#87639B',
  chicken: '#85763F',
};

const PRESET_GROUPS: { label: string; members: ResidentId[] }[] = [
  { label: '全家一起', members: [...RESIDENT_IDS] },
  { label: '三兄弟', members: ['xiaoba', 'yujie', 'weigang'] },
  { label: '爸妈和坤坤', members: ['door', 'gu', 'chicken'] },
];

const GroupMessageRow = memo(function GroupMessageRow({ message }: { message: FarmGroupMessage }) {
  if (message.speaker === 'player') {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View
          style={{
            maxWidth: '82%',
            borderRadius: 14,
            paddingHorizontal: 11,
            paddingVertical: 8,
            backgroundColor: '#E2E8CC',
            borderWidth: 1,
            borderColor: '#C4D3A8',
          }}
        >
          <FarmText style={{ color: '#435532', fontSize: 13, lineHeight: 20 }}>{message.text}</FarmText>
        </View>
      </View>
    );
  }
  const accent = MEMBER_COLORS[message.speaker];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
      <FarmSlotFrame size={34} rarity={1} style={{ marginTop: 2 }}>
        <FarmPersonSprite who={message.speaker} size={22} active={false} centered />
      </FarmSlotFrame>
      <View
        style={{
          flexShrink: 1,
          maxWidth: '84%',
          borderRadius: 14,
          paddingHorizontal: 11,
          paddingVertical: 8,
          backgroundColor: '#F7ECDE',
          borderWidth: 1,
          borderColor: '#E3D1B9',
          borderLeftWidth: 3,
          borderLeftColor: accent,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <FarmText variant="label" style={{ color: accent, fontSize: 11, fontWeight: '800' }}>
            {RESIDENTS[message.speaker].name}
          </FarmText>
          {message.mood ? (
            <FarmText style={{ color: '#8A785E', fontSize: 9.5 }}>· {message.mood}</FarmText>
          ) : null}
        </View>
        <FarmText style={{ color: '#59432E', fontSize: 13, lineHeight: 20 }}>{message.text}</FarmText>
      </View>
    </View>
  );
});

export function FarmGroupChatSheet({
  visible,
  onClose,
  members,
  onChangeMembers,
  messages,
  busy,
  value,
  onChange,
  onSend,
  onBanter,
  onClear,
  online,
  hint,
  typingLabel,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  members: ResidentId[];
  onChangeMembers: (next: ResidentId[]) => void;
  messages: FarmGroupMessage[];
  busy: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onBanter: () => void;
  onClear: () => void;
  online: boolean;
  hint?: string;
  typingLabel?: string;
  maxHeight: number;
}) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const activeKeyboardHeight = visible ? keyboardHeight : 0;
  const keyboardOpen = activeKeyboardHeight > 0;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(Math.max(0, Math.round(event.endCoordinates?.height ?? 0)));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bannerExpandedHeight = useMemo(() => {
    const innerWidth = Math.min(380, Math.max(200, windowWidth - 28));
    return Math.ceil(innerWidth * (44 / 150)) + 14;
  }, [windowWidth]);

  const bannerProgress = useSharedValue(1);
  useEffect(() => {
    const target = keyboardOpen ? 0 : 1;
    if (reducedMotion) {
      bannerProgress.set(target);
    } else {
      bannerProgress.set(
        withTiming(target, {
          duration: keyboardOpen ? 160 : 210,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }
  }, [keyboardOpen, reducedMotion, bannerProgress]);

  const bannerAnimStyle = useAnimatedStyle(() => ({
    height: bannerProgress.get() * bannerExpandedHeight,
    opacity: bannerProgress.get(),
  }));

  const effectiveListMaxHeight = useMemo(() => {
    if (!keyboardOpen) {
      return Math.max(176, maxHeight - 24);
    }
    // 键盘弹起且顶部横幅收起后，为消息区动态保留安全最大高度，防止挤压固定操作栏
    const availableForList = windowHeight - activeKeyboardHeight - insets.top - 244;
    return Math.max(108, Math.min(maxHeight + 36, Math.round(availableForList)));
  }, [keyboardOpen, maxHeight, windowHeight, activeKeyboardHeight, insets.top]);

  const listMessages = useMemo(
    () => messages.map(m => ({ ...m, role: (m.speaker === 'player' ? 'user' : 'assistant') as 'user' | 'assistant' })),
    [messages],
  );
  const renderMessage = useCallback(
    (message: FarmGroupMessage & { role: 'user' | 'assistant' }) => <GroupMessageRow message={message} />,
    [],
  );

  const toggleMember = (id: ResidentId) => {
    if (busy) return;
    if (members.includes(id)) {
      if (members.length <= 2) return;
      onChangeMembers(members.filter(m => m !== id));
    } else {
      onChangeMembers([...members, id]);
    }
  };

  const isPresetActive = (presetMembers: readonly ResidentId[]) =>
    members.length === presetMembers.length && presetMembers.every(id => members.includes(id));

  return (
    <FarmNPCSheet visible={visible} onClose={onClose}>
      <View
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: '#FFF9EF',
          flexShrink: 1,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          pointerEvents={keyboardOpen ? 'none' : 'auto'}
          style={[
            {
              flexShrink: 0,
              overflow: 'hidden',
            },
            bannerAnimStyle,
          ]}
        >
          <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            <FarmIllustration theme="group" />
          </View>
        </Animated.View>

        <View
          style={{
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingTop: keyboardOpen ? 4 : 8,
            paddingBottom: 6,
            gap: 8,
          }}
        >
          <FarmSlotFrame size={34} rarity={4}>
            <FarmUiIcon name="groupChat" size={20} />
          </FarmSlotFrame>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FarmText variant="title" numberOfLines={1} style={{ color: '#59432E', fontSize: 15, fontWeight: '800' }}>
                院子家庭群聊
              </FarmText>
              <FarmText numberOfLines={1} style={{ color: '#8A785E', fontSize: 10.5, flexShrink: 0 }}>
                {members.length} 人在场
              </FarmText>
              <View
                style={{
                  flexShrink: 0,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 99,
                  backgroundColor: online ? 'rgba(143,209,79,0.16)' : '#F1E5CC',
                }}
              >
                <FarmText style={{ color: online ? '#5F7749' : '#8A785E', fontSize: 8.5, fontWeight: '700' }}>
                  {online ? 'AI 群聊' : '本地群聊'}
                </FarmText>
              </View>
            </View>
            <FarmText numberOfLines={1} style={{ color: '#8A785E', fontSize: 10, marginTop: 1 }}>
              点击头像切换在场家人，可 @某人 顺手派活或传话
            </FarmText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭家庭群聊"
            onPress={onClose}
            hitSlop={8}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F3E6D0',
              borderWidth: 1,
              borderColor: '#DFCCA9',
            }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        <View style={{ flexShrink: 0, height: 40, justifyContent: 'center' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 14, alignItems: 'center' }}
          >
            {RESIDENT_IDS.map(id => {
              const active = members.includes(id);
              const accent = MEMBER_COLORS[id];
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => toggleMember(id)}
                  style={{
                    flexShrink: 0,
                    height: 32,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingLeft: 4,
                    paddingRight: 9,
                    borderRadius: 99,
                    backgroundColor: active ? '#F5EAD6' : '#F6F1E7',
                    borderWidth: 1.2,
                    borderColor: active ? accent : '#E3D7C6',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <FarmSlotFrame size={24} rarity={active ? 4 : 1} selected={active}>
                    <FarmPersonSprite who={id} size={16} active={false} centered />
                  </FarmSlotFrame>
                  <FarmText numberOfLines={1} style={{ color: active ? '#4F3B26' : '#8C7A63', fontSize: 11, lineHeight: 15, fontWeight: active ? '800' : '500' }}>
                    {RESIDENTS[id].name}
                  </FarmText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ flexShrink: 0, height: 38, justifyContent: 'center', marginBottom: 2 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 14, alignItems: 'center' }}
          >
            {PRESET_GROUPS.map(preset => {
              const matched = isPresetActive(preset.members);
              return (
                <Pressable
                  key={preset.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: matched }}
                  disabled={busy}
                  onPress={() => onChangeMembers(preset.members)}
                  style={{
                    flexShrink: 0,
                    height: 29,
                    paddingHorizontal: 11,
                    borderRadius: 99,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: matched ? '#EFE0C4' : '#F3E9D8',
                    borderWidth: 1,
                    borderColor: matched ? '#C7A675' : '#DFCEB5',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <FarmText
                    numberOfLines={1}
                    style={{
                      color: matched ? '#523B22' : '#6E573D',
                      fontSize: 11,
                      lineHeight: 15,
                      fontWeight: matched ? '800' : '600',
                    }}
                  >
                    {preset.label}
                  </FarmText>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onBanter}
              style={{
                flexShrink: 0,
                height: 29,
                paddingHorizontal: 11,
                borderRadius: 99,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#E4ECD4',
                borderWidth: 1,
                borderColor: '#B8C79F',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <FarmText numberOfLines={1} style={{ color: '#455B32', fontSize: 11, lineHeight: 15, fontWeight: '700' }}>
                让家人们自己聊两句
              </FarmText>
            </Pressable>
            {messages.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onClear}
                style={{
                  flexShrink: 0,
                  height: 29,
                  paddingHorizontal: 10,
                  borderRadius: 99,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F5ECE0',
                  borderWidth: 1,
                  borderColor: '#E2D4C0',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <FarmText numberOfLines={1} style={{ color: '#8A755B', fontSize: 11, lineHeight: 15 }}>
                  清空记录
                </FarmText>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        <ChatMessageList
          messages={listMessages}
          maxHeight={effectiveListMaxHeight}
          style={{ flexShrink: 1, flexGrow: 0, minHeight: 72 }}
          renderMessage={renderMessage}
          header={
            typingLabel || busy ? (
              <View style={{ paddingVertical: 4, paddingLeft: 4 }}>
                <FarmText style={{ color: '#8A785E', fontSize: 11.5 }}>
                  {typingLabel || '家人们正在你一言我一语…'}
                </FarmText>
              </View>
            ) : !messages.length ? (
              <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#F6EDE0', borderWidth: 1, borderColor: '#E4D4BE' }}>
                <FarmText style={{ color: '#7D684E', fontSize: 12, lineHeight: 19 }}>
                  大家都围坐在院子茶桌旁啦！你可以随口起个话头、点名某位家人（例如「玉洁今晚唱首歌？」），或直接点「让家人们自己聊两句」。
                </FarmText>
              </View>
            ) : null
          }
        />

        {hint ? (
          <View style={{ flexShrink: 0, paddingHorizontal: 14, paddingBottom: 4 }}>
            <FarmText style={{ color: '#8A7459', fontSize: 10.5 }}>
              {hint}
            </FarmText>
          </View>
        ) : null}

        <View
          style={{
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: 14,
            paddingTop: 6,
            paddingBottom: keyboardOpen ? 8 : 12,
            borderTopWidth: 1,
            borderTopColor: '#EADBC5',
            backgroundColor: '#FBF3E5',
          }}
        >
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChange}
            placeholder="在家庭群聊里说一句，或 @某位家人…"
            placeholderTextColor="#A19077"
            editable={!busy}
            multiline
            maxLength={220}
            style={{
              flex: 1,
              minHeight: 38,
              maxHeight: 88,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              backgroundColor: '#FFFDF8',
              borderWidth: 1,
              borderColor: '#DFCEB5',
              color: '#59432E',
              fontFamily: FARM_BODY_FONT,
              fontSize: 13,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送群聊消息"
            disabled={busy || !value.trim()}
            onPress={onSend}
            style={{
              height: 38,
              paddingHorizontal: 14,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: busy || !value.trim() ? '#E4DCCD' : '#7B9657',
              borderWidth: 1,
              borderColor: busy || !value.trim() ? '#D4C9B5' : '#647C45',
            }}
          >
            <FarmText style={{ color: busy || !value.trim() ? '#9B8D78' : '#FFFDF7', fontSize: 12.5, fontWeight: '800' }}>
              发送
            </FarmText>
          </Pressable>
        </View>
      </View>
    </FarmNPCSheet>
  );
}

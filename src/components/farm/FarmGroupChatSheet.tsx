import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useMemo, useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
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
        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <FarmIllustration theme="group" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, gap: 8 }}>
          <FarmSlotFrame size={34} rarity={4}>
            <FarmUiIcon name="groupChat" size={20} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FarmText variant="title" style={{ color: '#59432E', fontSize: 15, fontWeight: '800' }}>
                院子家庭群聊
              </FarmText>
              <FarmText style={{ color: '#8A785E', fontSize: 10.5 }}>
                {members.length} 人在场
              </FarmText>
              <View
                style={{
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
            <FarmText style={{ color: '#8A785E', fontSize: 10, marginTop: 1 }}>
              点击头像切换在场家人，可 @某人 顺手派活或传话
            </FarmText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭家庭群聊"
            onPress={onClose}
            hitSlop={8}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 7, alignItems: 'center' }}
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingLeft: 4,
                  paddingRight: 9,
                  paddingVertical: 3,
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
                <FarmText style={{ color: active ? '#4F3B26' : '#8C7A63', fontSize: 11, fontWeight: active ? '800' : '500' }}>
                  {RESIDENTS[id].name}
                </FarmText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}
        >
          {PRESET_GROUPS.map(preset => (
            <Pressable
              key={preset.label}
              disabled={busy}
              onPress={() => onChangeMembers(preset.members)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4.5,
                borderRadius: 99,
                backgroundColor: '#F3E9D8',
                borderWidth: 1,
                borderColor: '#DFCEB5',
              }}
            >
              <FarmText style={{ color: '#6E573D', fontSize: 10.5, fontWeight: '600' }}>{preset.label}</FarmText>
            </Pressable>
          ))}
          <Pressable
            disabled={busy}
            onPress={onBanter}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4.5,
              borderRadius: 99,
              backgroundColor: '#E4ECD4',
              borderWidth: 1,
              borderColor: '#B8C79F',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <FarmText style={{ color: '#455B32', fontSize: 10.5, fontWeight: '700' }}>让家人们自己聊两句</FarmText>
          </Pressable>
          {messages.length > 0 ? (
            <Pressable
              disabled={busy}
              onPress={onClear}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 4.5,
                borderRadius: 99,
                backgroundColor: '#F5ECE0',
                borderWidth: 1,
                borderColor: '#E2D4C0',
              }}
            >
              <FarmText style={{ color: '#8A755B', fontSize: 10.5 }}>清空记录</FarmText>
            </Pressable>
          ) : null}
        </ScrollView>

        <ChatMessageList
          messages={listMessages}
          maxHeight={Math.max(170, maxHeight - 54)}
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
          <FarmText style={{ paddingHorizontal: 14, paddingBottom: 4, color: '#8A7459', fontSize: 10.5 }}>
            {hint}
          </FarmText>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: 14,
            paddingTop: 6,
            paddingBottom: 12,
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

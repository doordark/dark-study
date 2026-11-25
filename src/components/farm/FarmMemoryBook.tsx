import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import type { ResidentMemory } from '@/utils/farmMemory';
import type { MemoryEpisodeKind, PeerStance } from '@/utils/farmPersonaMemory';
import { FarmUiIcon } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

const KIND_LABELS: Record<MemoryEpisodeKind, string> = {
  chat: '聊天',
  npc_talk: '偶遇',
  relay: '转述',
  group: '群聊',
  reflection: '反思',
};

const STANCE_LABELS: Record<PeerStance, string> = {
  warm: '亲近',
  close: '默契',
  amused: '打趣',
  worried: '惦记',
  awkward: '别扭',
  neutral: '平和',
};

export function FarmMemoryBook({
  who,
  memory,
  maxHeight,
  onDeleteFact,
  onDeleteEpisode,
}: {
  who: ResidentId;
  memory: ResidentMemory;
  maxHeight: number;
  onDeleteFact: (key: string) => void;
  onDeleteEpisode: (id: string) => void;
}) {
  const facts = [...(memory.playerFacts ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const peerEntries = Object.entries(memory.peerImpressions ?? {}) as [ResidentId, NonNullable<NonNullable<ResidentMemory['peerImpressions']>[ResidentId]>][];
  const reflections = [...(memory.reflections ?? [])].reverse();
  const episodes = [...(memory.episodes ?? [])].slice(-12).reverse();
  const empty = !facts.length && !peerEntries.length && !reflections.length && !episodes.length;

  return (
    <ScrollView
      style={{ maxHeight }}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <FarmParchmentCard tone="warm" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
        <FarmSlotFrame size={40} rarity={4}>
          <FarmUiIcon name="memory" size={24} />
        </FarmSlotFrame>
        <View style={{ flex: 1 }}>
          <FarmText style={{ color: '#533C26', fontSize: 13, fontWeight: '800' }}>
            {RESIDENTS[who].name}的随身记忆本
          </FarmText>
          <FarmText style={{ color: '#846F55', fontSize: 10.5, marginTop: 2 }}>
            记住 {facts.length} 条你的偏好 · {peerEntries.length} 位家人印象 · {episodes.length} 段近期回忆
          </FarmText>
        </View>
      </FarmParchmentCard>

      {empty ? (
        <FarmParchmentCard style={{ padding: 14 }}>
          <FarmText style={{ color: '#7D684E', fontSize: 12.5, lineHeight: 20 }}>
            {RESIDENTS[who].name}还没有攒下太多长期记忆。多聊聊你的喜好、送份心头好、一起自习或开家庭群聊，这里就会慢慢写满。
          </FarmText>
        </FarmParchmentCard>
      ) : null}

      {facts.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <FarmUiIcon name="wish" size={14} />
            <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
              记住关于你的事（{facts.length}）
            </FarmText>
          </View>
          {facts.map(fact => (
            <FarmParchmentCard
              key={fact.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: '#E5ECD6' }}>
                    <FarmText style={{ color: '#4B5F39', fontSize: 9.5, fontWeight: '700' }}>{fact.key}</FarmText>
                  </View>
                  {fact.privacy === 'private' ? (
                    <FarmText style={{ color: '#9D6C58', fontSize: 9.5 }}>仅私聊可见</FarmText>
                  ) : null}
                </View>
                <FarmText style={{ color: '#523E2A', fontSize: 12.5, lineHeight: 18 }}>{fact.text}</FarmText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除记忆 ${fact.key}`}
                hitSlop={8}
                onPress={() => onDeleteFact(fact.key)}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE3D1' }}
              >
                <Ionicons name="close" size={14} color="#8D7559" />
              </Pressable>
            </FarmParchmentCard>
          ))}
        </View>
      ) : null}

      {peerEntries.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <FarmUiIcon name="groupChat" size={14} />
            <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
              对家人的动态印象（{peerEntries.length}）
            </FarmText>
          </View>
          {peerEntries.map(([peerId, imp]) => (
            <FarmParchmentCard
              key={peerId}
              tone="warm"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <FarmSlotFrame size={36} rarity={1}>
                <FarmPersonSprite who={peerId} size={24} active={false} centered />
              </FarmSlotFrame>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FarmText style={{ color: '#59432E', fontSize: 12, fontWeight: '800' }}>
                    {RESIDENTS[peerId].name}
                  </FarmText>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: '#EADBC5' }}>
                    <FarmText style={{ color: '#745B3E', fontSize: 9.5, fontWeight: '700' }}>
                      {STANCE_LABELS[imp.stance]}
                    </FarmText>
                  </View>
                </View>
                <FarmText style={{ color: '#5A4632', fontSize: 12, lineHeight: 17 }}>{imp.note}</FarmText>
              </View>
            </FarmParchmentCard>
          ))}
        </View>
      ) : null}

      {reflections.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <FarmUiIcon name="memory" size={14} />
            <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
              近期内心感悟
            </FarmText>
          </View>
          {reflections.map((note, index) => (
            <FarmParchmentCard key={`refl-${index}`} tone="sage" style={{ paddingHorizontal: 11, paddingVertical: 8 }}>
              <FarmText style={{ color: '#435532', fontSize: 12, lineHeight: 18 }}>{note}</FarmText>
            </FarmParchmentCard>
          ))}
        </View>
      ) : null}

      {episodes.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <FarmUiIcon name="gazette" size={14} />
            <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
              最近留在心里的事（{episodes.length}）
            </FarmText>
          </View>
          {episodes.map(ep => (
            <FarmParchmentCard
              key={ep.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8 }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FarmText style={{ color: '#8A6943', fontSize: 10, fontWeight: '700' }}>
                    {KIND_LABELS[ep.kind]}
                  </FarmText>
                  {ep.emotion ? (
                    <FarmText style={{ color: '#9C8364', fontSize: 10 }}>· {ep.emotion}</FarmText>
                  ) : null}
                  {ep.privacy === 'private' ? (
                    <FarmText style={{ color: '#A56C57', fontSize: 9.5 }}>· 仅私聊</FarmText>
                  ) : null}
                </View>
                <FarmText style={{ color: '#533F2B', fontSize: 12, lineHeight: 18 }}>{ep.text}</FarmText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="遗忘这段回忆"
                hitSlop={8}
                onPress={() => onDeleteEpisode(ep.id)}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE3D1' }}
              >
                <Ionicons name="close" size={14} color="#8D7559" />
              </Pressable>
            </FarmParchmentCard>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

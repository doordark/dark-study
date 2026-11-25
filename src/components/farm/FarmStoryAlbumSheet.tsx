import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from '@/utils/farmLife';
import type { FarmMemories } from '@/utils/farmMemory';
import {
  nextUnlockableChapter,
  RESIDENT_STORIES,
  type FarmStoryProgress,
} from '@/utils/farmStories';
import { FarmPropSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmButton, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

export function FarmStoryAlbumSheet({
  visible,
  onClose,
  progress,
  memories,
  onClaimChapter,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  progress: FarmStoryProgress;
  memories: FarmMemories;
  onClaimChapter: (who: ResidentId) => void;
  maxHeight: number;
}) {
  const [tab, setTab] = useState<'stories' | 'album'>('stories');

  return (
    <FarmNPCSheet visible={visible} onClose={onClose}>
      <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFF9EF', overflow: 'hidden', flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 8, gap: 9 }}>
          <FarmSlotFrame size={40} rarity={3} selected>
            <FarmPropSprite name="album" size={28} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <FarmText variant="title" style={{ color: '#553B24', fontSize: 16, fontWeight: '800' }}>
              家庭支线 · 纪念相册
            </FarmText>
            <FarmText style={{ color: '#857056', fontSize: 10.5, marginTop: 2 }}>
              已珍藏 {progress.album.length} 张瞬间 · 每位家人拥有 5 幕专属成长剧情
            </FarmText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭家庭支线相册"
            onPress={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
          {([
            ['stories', '个人支线 (1～5 幕)'],
            ['album', `家庭相册 (${progress.album.length})`],
          ] as const).map(([k, lbl]) => {
            const active = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 11,
                  alignItems: 'center',
                  backgroundColor: active ? '#DCE7C7' : '#F4EAD8',
                  borderWidth: 1.2,
                  borderColor: active ? '#91A872' : '#DECBB0',
                }}
              >
                <FarmText style={{ color: active ? '#384D26' : '#7B664C', fontSize: 11.5, fontWeight: '800' }}>{lbl}</FarmText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={{ maxHeight: Math.max(260, maxHeight + 48) }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20, gap: 10 }} showsVerticalScrollIndicator={false}>
          {tab === 'stories' ? (
            RESIDENT_IDS.map(id => {
              const doneAct = progress.acts[id] ?? 0;
              const unlockable = nextUnlockableChapter(id, progress, memories);
              const nextCh = doneAct < 5 ? RESIDENT_STORIES[id][doneAct] : null;
              const mem = memories[id];
              const epCount = (mem.episodes?.length ?? 0) + Math.floor(mem.turns.length / 2);
              return (
                <FarmParchmentCard key={id} tone={unlockable ? 'sage' : 'warm'} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <FarmSlotFrame size={46} rarity={doneAct >= 5 ? 5 : unlockable ? 4 : 1} selected={Boolean(unlockable)}>
                      <FarmPersonSprite who={id} size={30} active={false} centered />
                    </FarmSlotFrame>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FarmText style={{ color: '#4F3924', fontSize: 13.5, fontWeight: '800' }}>
                          {RESIDENTS[id].name}
                        </FarmText>
                        <FarmText style={{ color: '#7D684E', fontSize: 10.5 }}>
                          进度 {doneAct}/5 幕
                        </FarmText>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                        {[1, 2, 3, 4, 5].map(step => (
                          <View
                            key={step}
                            style={{
                              flex: 1,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: step <= doneAct ? '#71914F' : '#E3D5BE',
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  {nextCh ? (
                    <View style={{ gap: 6 }}>
                      <FarmText style={{ color: '#533C26', fontSize: 12.5, fontWeight: '800' }}>
                        第 {nextCh.act} 幕：{nextCh.title}
                      </FarmText>
                      <FarmText style={{ color: '#6E5840', fontSize: 11.5, lineHeight: 17 }}>
                        {unlockable ? nextCh.summary : `解锁条件：好感 ${mem.affinity}/${nextCh.reqAffinity} · 回忆积累 ${epCount}/${nextCh.reqEpisodes}`}
                      </FarmText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <FarmUiIcon name="coin" size={13} />
                          <FarmText style={{ color: '#8A6329', fontSize: 11, fontWeight: '700' }}>+{nextCh.rewardCoins}</FarmText>
                          {nextCh.rewardCompost > 0 ? (
                            <>
                              <FarmToolSprite kind="compost" size={14} />
                              <FarmText style={{ color: '#4B6935', fontSize: 11, fontWeight: '700' }}>+{nextCh.rewardCompost}</FarmText>
                            </>
                          ) : null}
                        </View>
                        {unlockable ? (
                          <FarmButton label={`解锁第 ${nextCh.act} 幕 · 收入相册`} tone="sage" onPress={() => onClaimChapter(id)} style={{ minHeight: 34, paddingVertical: 5 }} />
                        ) : (
                          <FarmText style={{ color: '#947F65', fontSize: 10.5 }}>多聊聊天/送礼继续推进</FarmText>
                        )}
                      </View>
                    </View>
                  ) : (
                    <FarmText style={{ color: '#486032', fontSize: 12, fontWeight: '700' }}>
                      全部 5 幕专属剧情已圆满珍藏进家庭相册！
                    </FarmText>
                  )}
                </FarmParchmentCard>
              );
            })
          ) : progress.album.length === 0 ? (
            <FarmParchmentCard style={{ padding: 16 }}>
              <FarmText style={{ color: '#7D684E', fontSize: 12.5, lineHeight: 20 }}>
                相册还空着呢！随着你和家人们聊天、送礼、一起伴读，解锁个人支线第 1 幕后，这里就会珍藏下第一张带寄语的纪念照片。
              </FarmText>
            </FarmParchmentCard>
          ) : (
            progress.album.slice().reverse().map(snap => (
              <FarmParchmentCard key={snap.id} tone="cream" style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FarmSlotFrame size={50} rarity={4} selected>
                    <FarmPersonSprite who={snap.resident} size={32} active={false} centered />
                  </FarmSlotFrame>
                  <View style={{ flex: 1 }}>
                    <FarmText style={{ color: '#513A24', fontSize: 13.5, fontWeight: '800' }}>
                      {snap.title}
                    </FarmText>
                    <FarmText style={{ color: '#8A7459', fontSize: 10.5, marginTop: 2 }}>
                      {RESIDENTS[snap.resident].name} · 第 {snap.act} 幕 · 农场第 {snap.day} 天
                    </FarmText>
                  </View>
                </View>
                <View style={{ padding: 10, borderRadius: 10, backgroundColor: '#F3E9D8', borderLeftWidth: 3, borderLeftColor: '#C5924E' }}>
                  <FarmText style={{ color: '#58422B', fontSize: 12, lineHeight: 18 }}>
                    “{snap.quote}”
                  </FarmText>
                </View>
              </FarmParchmentCard>
            ))
          )}
        </ScrollView>
      </View>
    </FarmNPCSheet>
  );
}

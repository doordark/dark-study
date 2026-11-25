import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from '@/utils/farmLife';
import { affinityLabel, type FarmMemories } from '@/utils/farmMemory';
import { PAIR_DYNAMICS } from '@/utils/farmPersonality';
import { FarmUiIcon } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

const NODE_COLORS: Record<ResidentId, string> = {
  door: '#5E7D45',
  gu: '#A65D78',
  xiaoba: '#527C9F',
  yujie: '#9B7437',
  weigang: '#87639B',
  chicken: '#85763F',
};

const GRAPH_W = 320;
const GRAPH_H = 248;

const NODE_POSITIONS: Record<ResidentId, { x: number; y: number }> = {
  door: { x: 100, y: 40 },
  gu: { x: 220, y: 40 },
  xiaoba: { x: 46, y: 124 },
  yujie: { x: 274, y: 124 },
  weigang: { x: 100, y: 206 },
  chicken: { x: 220, y: 206 },
};

const CENTER = { x: 160, y: 124 };

export function FarmRelationGraph({
  memories,
  followedId,
  onFollow,
  onTalk,
}: {
  memories: FarmMemories;
  followedId: ResidentId | null;
  onFollow: (who: ResidentId) => void;
  onTalk: (who: ResidentId) => void;
}) {
  const [selected, setSelected] = useState<ResidentId>('gu');
  const mem = memories[selected];
  const impressions = Object.entries(mem.peerImpressions ?? {}) as [
    ResidentId,
    NonNullable<NonNullable<typeof mem.peerImpressions>[ResidentId]>,
  ][];

  const peerEdges: { a: ResidentId; b: ResidentId; dynamic: boolean }[] = [];
  for (let i = 0; i < RESIDENT_IDS.length; i++) {
    for (let j = i + 1; j < RESIDENT_IDS.length; j++) {
      const a = RESIDENT_IDS[i];
      const b = RESIDENT_IDS[j];
      const hasDynamic = Boolean(memories[a].peerImpressions?.[b] || memories[b].peerImpressions?.[a]);
      if (hasDynamic || a === selected || b === selected) {
        peerEdges.push({ a, b, dynamic: hasDynamic });
      }
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <FarmParchmentCard style={{ alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 }}>
        <View style={{ width: GRAPH_W, height: GRAPH_H, position: 'relative' }}>
          <Svg width={GRAPH_W} height={GRAPH_H} viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}>
            {peerEdges.map(({ a, b, dynamic }) => {
              const pa = NODE_POSITIONS[a];
              const pb = NODE_POSITIONS[b];
              return (
                <Line
                  key={`${a}-${b}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={dynamic ? '#C88542' : '#E2D4BD'}
                  strokeWidth={dynamic ? 2.4 : 1.1}
                  strokeDasharray={dynamic ? undefined : '4,4'}
                  opacity={dynamic ? 0.9 : 0.7}
                />
              );
            })}

            {RESIDENT_IDS.map(id => {
              const p = NODE_POSITIONS[id];
              const aff = memories[id].affinity;
              const active = id === selected;
              return (
                <Line
                  key={`player-${id}`}
                  x1={CENTER.x}
                  y1={CENTER.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={active ? '#5E7F43' : aff >= 24 ? '#9BB27C' : '#D9CCB7'}
                  strokeWidth={active ? 2.8 : aff >= 60 ? 2.2 : 1.4}
                />
              );
            })}
          </Svg>

          {/* Center player portrait node */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: CENTER.x - 24,
              top: CENTER.y - 24,
              alignItems: 'center',
            }}
          >
            <FarmSlotFrame size={48} rarity={2} selected>
              <FarmPersonSprite who="hero" size={26} active={false} centered />
            </FarmSlotFrame>
            <View style={{ marginTop: -5, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99, backgroundColor: '#5E7F43' }}>
              <FarmText style={{ color: '#FFFDF7', fontSize: 9.5, fontWeight: '800' }}>你</FarmText>
            </View>
          </View>

          {/* 6 Resident portrait nodes */}
          {RESIDENT_IDS.map(id => {
            const p = NODE_POSITIONS[id];
            const color = NODE_COLORS[id];
            const isSel = id === selected;
            const isFollowed = id === followedId;
            const aff = memories[id].affinity;
            const rarity: 0 | 1 | 2 | 3 | 4 | 5 = isFollowed ? 4 : aff >= 75 ? 5 : aff >= 45 ? 4 : 1;
            const nodeSize = isSel ? 48 : 42;
            return (
              <Pressable
                key={`node-${id}`}
                accessibilityRole="button"
                accessibilityLabel={`查看${RESIDENTS[id].name}关系`}
                onPress={() => setSelected(id)}
                style={{
                  position: 'absolute',
                  left: p.x - nodeSize / 2,
                  top: p.y - nodeSize / 2,
                  alignItems: 'center',
                }}
              >
                <FarmSlotFrame size={nodeSize} rarity={rarity} selected={isSel || isFollowed}>
                  <FarmPersonSprite who={id} size={isSel ? 30 : 25} active={false} centered />
                </FarmSlotFrame>
                <View
                  style={{
                    marginTop: -6,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 99,
                    backgroundColor: isSel ? color : '#FFF9EC',
                    borderWidth: 1,
                    borderColor: isFollowed ? '#D48A34' : color,
                  }}
                >
                  <FarmText style={{ color: isSel ? '#FFFDF7' : color, fontSize: 9.5, fontWeight: '800' }}>
                    {RESIDENTS[id].name}
                  </FarmText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <FarmText style={{ color: '#8A755B', fontSize: 10, marginTop: 4 }}>
          轻点像素头像查看羁绊 · 橙实线=家人近期产生新印象 · 金框=高好感/跟拍中
        </FarmText>
      </FarmParchmentCard>

      {/* Selected resident detail card */}
      <FarmParchmentCard tone="warm" style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FarmSlotFrame size={50} rarity={mem.affinity >= 60 ? 4 : 1} selected={followedId === selected}>
            <FarmPersonSprite who={selected} size={32} active={false} centered />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <FarmText style={{ color: '#4E3924', fontSize: 14, fontWeight: '800' }}>
              {RESIDENTS[selected].name} · {affinityLabel(mem.affinity)}（{mem.affinity}/100）
            </FarmText>
            <FarmText style={{ color: '#7D684E', fontSize: 11, marginTop: 2 }}>
              {RESIDENTS[selected].identity} · 此刻心情：{mem.mood ?? '平静'}
            </FarmText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => onFollow(selected)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: followedId === selected ? '#F3DFBE' : '#EFE5D3',
              borderWidth: 1,
              borderColor: followedId === selected ? '#D09446' : '#D9C7AD',
            }}
          >
            <FarmUiIcon name="camera" size={16} />
            <FarmText style={{ color: '#6E4C24', fontSize: 11.5, fontWeight: '700' }}>
              {followedId === selected ? '正在跟拍（点此退出）' : '跟拍围观'}
            </FarmText>
          </Pressable>
          <Pressable
            onPress={() => onTalk(selected)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: '#E4ECD4',
              borderWidth: 1,
              borderColor: '#B8C79F',
            }}
          >
            <FarmUiIcon name="groupChat" size={16} />
            <FarmText style={{ color: '#425930', fontSize: 11.5, fontWeight: '700' }}>
              去找他聊聊
            </FarmText>
          </Pressable>
        </View>

        {impressions.length > 0 ? (
          <View style={{ gap: 4 }}>
            <FarmText style={{ color: '#7C603D', fontSize: 11, fontWeight: '700' }}>
              他对其他家人的最新印象：
            </FarmText>
            {impressions.map(([peer, imp]) => (
              <View key={peer} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FarmSlotFrame size={24} rarity={1}>
                  <FarmPersonSprite who={peer} size={16} active={false} centered />
                </FarmSlotFrame>
                <FarmText style={{ flex: 1, color: '#5A4632', fontSize: 11.5, lineHeight: 17 }}>
                  对{RESIDENTS[peer].name}：{imp.note}
                </FarmText>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: 3 }}>
            <FarmText style={{ color: '#7C603D', fontSize: 11, fontWeight: '700' }}>
              家庭默契底色：
            </FarmText>
            {RESIDENT_IDS.filter(other => other !== selected)
              .slice(0, 2)
              .map(other => {
                const pairKey = [selected, other].sort().join('+');
                const note = PAIR_DYNAMICS[pairKey];
                return note ? (
                  <FarmText key={other} style={{ color: '#6F5A42', fontSize: 11, lineHeight: 16 }}>
                    • 与{RESIDENTS[other].name}：{note}
                  </FarmText>
                ) : null;
              })}
          </View>
        )}
      </FarmParchmentCard>
    </View>
  );
}

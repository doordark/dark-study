import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedAtlas } from '@/components/AnimatedAtlas';
import { HOUSE_ROOM } from '@/constants/farmMap';
import { playSfx } from '@/services/soundEffects';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import {
  FARM_ROOMS,
  FARM_ROOM_IDS,
  isDeepSleepHour,
  SLEEPING_DREAMS,
  sleepersByRoom,
  type FarmRoomId,
  type IndoorSleeperId,
} from '@/utils/farmSleep';
import { FarmPropSprite } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmButton, FarmIllustration, FarmSlotFrame, FarmText as Text } from './FarmSkin';

export interface HouseInteriorProps {
  visible: boolean;
  night: boolean;
  day: number;
  clock: string;
  hour?: number;
  sleepingResidents?: IndoorSleeperId[];
  tuckedInIds?: readonly ResidentId[];
  sleepDeprived?: boolean;
  onClose: () => void;
  onSleep: (mode?: 'nap' | 'full') => void;
  onOpenFocus?: () => void;
  onWakeResident?: (who: IndoorSleeperId) => void;
  onTuckInResident?: (who: IndoorSleeperId) => void;
}

const ROOM_ART: Record<FarmRoomId, { day: ImageSourcePropType; night: ImageSourcePropType }> = {
  master: {
    day: require('../../../assets/images/farm-house-interior-v2.png'),
    night: require('../../../assets/images/farm-house-interior-night-v2.png'),
  },
  xiaoba: {
    day: require('../../../assets/images/farm-room-xiaoba-day.webp'),
    night: require('../../../assets/images/farm-room-xiaoba-night.webp'),
  },
  yujie: {
    day: require('../../../assets/images/farm-room-yujie-day.webp'),
    night: require('../../../assets/images/farm-room-yujie-night.webp'),
  },
  weigang: {
    day: require('../../../assets/images/farm-room-weigang-day.webp'),
    night: require('../../../assets/images/farm-room-weigang-night.webp'),
  },
};

const SLEEP_SPRITES = require('../../../assets/images/farm-runtime/farm-sleep-sprites.png');
const SLEEP_HOLDS = [620, 560, 620, 560];
const SLEEPER_ROW: Record<ResidentId, number> = {
  door: 0,
  gu: 1,
  xiaoba: 2,
  yujie: 3,
  weigang: 4,
  chicken: 5,
};

/** 多房间像素小屋：主卧（door & 顾双人床）+ 三兄弟独立卧室 + 坤坤小窝夜间状态 */
export function HouseInterior({
  visible,
  night,
  day,
  clock,
  hour = 22,
  sleepingResidents = [],
  tuckedInIds = [],
  sleepDeprived = false,
  onClose,
  onSleep,
  onOpenFocus,
  onWakeResident,
  onTuckInResident,
}: HouseInteriorProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [roomId, setRoomId] = useState<FarmRoomId>('master');
  const [sleepingMode, setSleepingMode] = useState<'nap' | 'full' | null>(null);
  const [selectedSleeper, setSelectedSleeper] = useState<IndoorSleeperId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const light = useSharedValue(night ? 1 : 0);

  useEffect(() => {
    light.value = withTiming(night ? 1 : 0, { duration: 600 });
  }, [night, light]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (visible) playSfx('farm_door', { volume: 0.65 });
  }, [visible]);

  const nightStyle = useAnimatedStyle(() => ({ opacity: light.value }));
  const byRoom = useMemo(() => sleepersByRoom(sleepingResidents), [sleepingResidents]);
  const tuckedSet = useMemo(() => new Set(tuckedInIds), [tuckedInIds]);
  const room = FARM_ROOMS[roomId];
  const roomSleepers = byRoom[roomId];
  const deepSleep = night && isDeepSleepHour(hour);
  const sleeping = sleepingMode !== null;

  const reserveBottom = 290;
  const roomW = Math.max(
    180,
    Math.min(
      width - 24,
      500,
      ((height - insets.top - insets.bottom - reserveBottom) * HOUSE_ROOM.width) / HOUSE_ROOM.height,
    ),
  );
  const scale = roomW / HOUSE_ROOM.width;

  const close = () => {
    if (!sleeping) {
      playSfx('farm_door', { volume: 0.54, rate: 0.92 });
      setSelectedSleeper(null);
      onClose();
    }
  };

  const triggerSleep = (mode: 'nap' | 'full') => {
    if (sleeping) return;
    setSleepingMode(mode);
    playSfx('farm_sleep', { volume: 0.72 });
    timer.current = setTimeout(() => {
      setSleepingMode(null);
      onSleep(mode);
    }, mode === 'nap' ? 900 : 1200);
  };

  const bgMain = night ? '#1E2532' : '#F5EDD8';
  const cardBg = night ? 'rgba(255, 248, 234, 0.09)' : 'rgba(255, 250, 238, 0.92)';
  const cardBorder = night ? 'rgba(228, 214, 181, 0.24)' : '#DFCFAF';
  const ink = night ? '#F6EEDC' : '#5E4930';
  const subInk = night ? '#B6C1CC' : '#857155';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      {visible ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: bgMain }}>
          <StatusBar style={night ? 'light' : 'dark'} />

          {/* 顶栏 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 10 }}>
            <FarmButton onPress={close} disabled={sleeping} tone="paper" style={{ width: 42, paddingHorizontal: 0 }}>
              <Ionicons name="chevron-back" size={20} color="#76583B" />
            </FarmButton>
            <View style={{ flex: 1 }}>
              <Text variant="title" style={{ color: ink, fontSize: 16.5, fontWeight: '800' }}>
                {room.name}
              </Text>
              <Text style={{ color: subInk, fontSize: 11, marginTop: 2 }}>
                第 {day} 天 · {clock} · {night ? (deepSleep ? '深夜熟睡中' : '夜色渐深') : '阳光正好'}
                {sleepDeprived ? ' · 全员略困' : ''}
              </Text>
            </View>
            <FarmIllustration theme="house" compact />
          </View>

          {/* 房间切换走廊 Tab */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8, gap: 7 }}
          >
            {FARM_ROOM_IDS.map(rid => {
              const meta = FARM_ROOMS[rid];
              const active = rid === roomId;
              const sleeperCount = byRoom[rid].length;
              return (
                <Pressable
                  key={rid}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (rid !== roomId) playSfx('after_star_flip', { volume: 0.44, rate: 0.88 });
                    setRoomId(rid);
                    setSelectedSleeper(null);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6.5,
                    borderRadius: 99,
                    backgroundColor: active
                      ? (night ? '#E5C484' : '#6F8857')
                      : (night ? 'rgba(255,248,234,0.1)' : '#EAE0CA'),
                    borderWidth: 1,
                    borderColor: active
                      ? (night ? '#F4DAA2' : '#576F42')
                      : (night ? 'rgba(255,248,234,0.18)' : '#D7C6A5'),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '800',
                      color: active ? (night ? '#3D2710' : '#FFFDF6') : (night ? '#DFD6C4' : '#6A5438'),
                    }}
                  >
                    {meta.shortName}
                  </Text>
                  {night && sleeperCount > 0 ? (
                    <View
                      style={{
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 99,
                        backgroundColor: active ? 'rgba(0,0,0,0.18)' : 'rgba(130,152,214,0.28)',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9.5,
                          fontWeight: '800',
                          color: active ? (night ? '#3D2710' : '#FFFDF6') : '#C8D8FA',
                        }}
                      >
                        💤{sleeperCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingBottom: 18,
              gap: 11,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* 房间像素场景 + 床上实时熟睡像素精灵 */}
            <View
              style={{
                width: roomW,
                height: HOUSE_ROOM.height * scale,
                overflow: 'hidden',
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: night ? '#5A6475' : '#D4BA91',
                backgroundColor: '#71472E',
              }}
            >
              <Image
                accessibilityLabel={room.name}
                source={ROOM_ART[roomId].day}
                resizeMode="stretch"
                fadeDuration={0}
                style={{ width: roomW, height: HOUSE_ROOM.height * scale }}
              />
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, nightStyle]}>
                <Image
                  source={ROOM_ART[roomId].night}
                  resizeMode="stretch"
                  fadeDuration={0}
                  style={{ width: roomW, height: HOUSE_ROOM.height * scale }}
                />
              </Animated.View>

              {/* 空床点击休息热区 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${room.name}床铺，点击休息`}
                disabled={sleeping}
                onPress={() => triggerSleep('full')}
                style={{
                  position: 'absolute',
                  left: room.bedRect.x * scale,
                  top: room.bedRect.y * scale,
                  width: room.bedRect.w * scale,
                  height: room.bedRect.h * scale,
                }}
              />

              {/* 夜晚床上熟睡的家人像素贴图（door & 顾并排睡在主卧双人床上！） */}
              {night
                ? room.sleepSlots.map(slot => {
                    if (!roomSleepers.includes(slot.resident)) return null;
                    const row = SLEEPER_ROW[slot.resident];
                    const frames = [row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3];
                    const isPicked = selectedSleeper === slot.resident;
                    return (
                      <Pressable
                        key={slot.resident}
                        accessibilityRole="button"
                        accessibilityLabel={`正在熟睡的${RESIDENTS[slot.resident].name}，点击查看梦话或互动`}
                        onPress={() => setSelectedSleeper(prev => (prev === slot.resident ? null : slot.resident))}
                        style={{
                          position: 'absolute',
                          left: slot.x * scale,
                          top: slot.y * scale,
                          width: slot.w * scale,
                          height: slot.h * scale,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            borderRadius: 6,
                            borderWidth: isPicked ? 1.5 : 0,
                            borderColor: '#F7D78A',
                            overflow: 'hidden',
                          }}
                        >
                          <AnimatedAtlas
                            source={SLEEP_SPRITES}
                            columns={4}
                            rows={6}
                            frames={frames}
                            holds={SLEEP_HOLDS}
                            width={slot.w * scale}
                            height={slot.h * scale}
                            active={visible && !sleeping}
                          />
                        </View>
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            top: -12,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 99,
                            backgroundColor: 'rgba(22, 28, 44, 0.84)',
                          }}
                        >
                          <Text style={{ color: '#F5E7C6', fontSize: 9, fontWeight: '800' }}>
                            {RESIDENTS[slot.resident].name} zZ
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                : null}
            </View>

            {/* 房间简介 + 双模式休息操作区 */}
            <View
              style={{
                width: '100%',
                maxWidth: 500,
                padding: 12,
                borderRadius: 16,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                gap: 9,
              }}
            >
              <Text style={{ color: ink, fontSize: 12, lineHeight: 18 }}>
                {night ? room.nightFlavor : room.dayFlavor}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FarmButton
                  tone="paper"
                  disabled={sleeping}
                  onPress={() => triggerSleep('nap')}
                  style={{ flex: 1 }}
                >
                  <Ionicons name="sunny-outline" size={14} color="#76583B" />
                  <Text variant="label" style={{ fontSize: 11.5, color: '#6E5336' }}>小憩 3 小时</Text>
                </FarmButton>
                <FarmButton
                  tone="blue"
                  disabled={sleeping}
                  onPress={() => triggerSleep('full')}
                  style={{ flex: 1 }}
                >
                  <Ionicons name="moon" size={14} color="#345675" />
                  <Text variant="label" style={{ fontSize: 11.5, color: '#345675' }}>睡到天明 07:00</Text>
                </FarmButton>
              </View>
              {room.hasDeskFocus && onOpenFocus ? (
                <FarmButton tone="sage" disabled={sleeping} onPress={onOpenFocus}>
                  <FarmPropSprite name="focus" size={17} />
                  <Text variant="label" style={{ fontSize: 11.5, color: '#455A31' }}>
                    坐在{roomId === 'master' ? '书桌' : `${RESIDENTS[room.occupants[0]].name}书桌`}前开启伴读钟
                  </Text>
                </FarmButton>
              ) : null}
            </View>

            {/* 当前房间的熟睡家人互动卡片（支持悄悄盖被子 / 轻声叫醒） */}
            {night ? (
              <View
                style={{
                  width: '100%',
                  maxWidth: 500,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="label" style={{ color: '#F5E7C6', fontSize: 12.5 }}>
                    {roomId === 'master'
                      ? `主卧双人床熟睡中（${roomSleepers.length}/2）`
                      : `${room.shortName}熟睡状态（${roomSleepers.length}/1）`}
                  </Text>
                  <Text style={{ color: '#AEB8C4', fontSize: 10.5 }}>
                    {deepSleep ? '深夜叫醒会有起床气哦' : '盖被子可提升好感与心情'}
                  </Text>
                </View>

                {roomSleepers.length === 0 ? (
                  <Text style={{ color: '#B4BFC9', fontSize: 11.5, lineHeight: 18 }}>
                    {roomId === 'master'
                      ? '双人床现在空着——door 和 顾 要么还在院子里散步/有深夜小事件，要么刚被你叫醒啦。'
                      : `${RESIDENTS[room.occupants[0]].name} 这会儿还没回床睡，去院子里瞧瞧他在忙什么吧！`}
                  </Text>
                ) : (
                  roomSleepers.map(id => {
                    const alreadyTucked = tuckedSet.has(id);
                    const highlighted = selectedSleeper === id;
                    return (
                      <View
                        key={id}
                        style={{
                          padding: 9,
                          borderRadius: 12,
                          backgroundColor: highlighted ? 'rgba(229, 196, 132, 0.18)' : 'rgba(20, 26, 36, 0.55)',
                          borderWidth: 1,
                          borderColor: highlighted ? '#E5C484' : 'rgba(222, 204, 168, 0.2)',
                          gap: 8,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <FarmSlotFrame size={38} rarity={1}>
                            <FarmPersonSprite who={id} size={24} active={false} centered />
                          </FarmSlotFrame>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#F7ECD4', fontSize: 12.5, fontWeight: '800' }}>
                              {RESIDENTS[id].name} · {roomId === 'master' ? (id === 'door' ? '双人床左侧' : '双人床右侧') : '安稳熟睡'}
                            </Text>
                            <Text numberOfLines={2} style={{ color: '#B4BFC9', fontSize: 10.5, marginTop: 2, lineHeight: 15 }}>
                              梦话：“{SLEEPING_DREAMS[id]}”
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                          {onTuckInResident ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={alreadyTucked}
                              onPress={() => {
                                playSfx('farm_sleep', { volume: 0.62 });
                                onTuckInResident(id);
                              }}
                              style={{
                                paddingHorizontal: 11,
                                paddingVertical: 6,
                                borderRadius: 99,
                                backgroundColor: alreadyTucked ? 'rgba(138, 166, 120, 0.25)' : '#8BB174',
                              }}
                            >
                              <Text style={{ color: alreadyTucked ? '#B6C9A8' : '#1E3314', fontSize: 11, fontWeight: '800' }}>
                                {alreadyTucked ? '已盖好被子 ✓' : '悄悄盖被子'}
                              </Text>
                            </Pressable>
                          ) : null}
                          {onWakeResident ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`叫醒${RESIDENTS[id].name}`}
                              onPress={() => onWakeResident(id)}
                              style={{
                                paddingHorizontal: 11,
                                paddingVertical: 6,
                                borderRadius: 99,
                                backgroundColor: '#E5C484',
                              }}
                            >
                              <Text style={{ color: '#4A3114', fontSize: 11, fontWeight: '800' }}>轻声叫醒</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}

                {/* 坤坤鸡窝夜间小卡 */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 240, 200, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(230, 200, 140, 0.16)',
                  }}
                >
                  <AnimatedAtlas
                    source={SLEEP_SPRITES}
                    columns={4}
                    rows={6}
                    frames={[20, 21, 22, 23]}
                    holds={SLEEP_HOLDS}
                    width={36}
                    height={40}
                    active={visible && !sleeping}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#F5E7C6', fontSize: 11.5, fontWeight: '800' }}>
                      院外鸡窝 · 坤坤蜷在稻草里打盹
                    </Text>
                    <Text style={{ color: '#AEB8C4', fontSize: 10.5, marginTop: 1 }}>
                      “咕……呼呼……明天早上要吃一大碗香米……”
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {sleeping ? (
            <Animated.View
              entering={FadeIn.duration(220)}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(6,10,22,0.96)', alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Ionicons name={sleepingMode === 'nap' ? 'partly-sunny' : 'moon'} size={34} color="#F5C466" />
              <Text style={{ color: '#F6EEDC', fontSize: 22, marginTop: 16, letterSpacing: 6 }}>
                {sleepingMode === 'nap' ? '小 憩 中 …' : 'Z z z …'}
              </Text>
              <Text style={{ color: '#AEB9B0', fontSize: 12, marginTop: 12 }}>
                {sleepingMode === 'nap' ? '眯一小会儿，给作物和全家充个电' : '一夜好眠，等清晨阳光照进菜田'}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}

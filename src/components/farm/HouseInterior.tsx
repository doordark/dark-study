import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
/** 只保留头和头发、按各房间夜景枕头配色调过色的睡颜图集（scripts/build-sleep-heads.py 生成） */
const SLEEP_HEADS = require('../../../assets/images/farm-runtime/farm-sleep-heads-night.png');
const SLEEP_HOLDS = [620, 560, 620, 560];
/** 睡颜单格 112×128 源像素 → 房间 240×180 逻辑单位的缩放（0.85 个原画像素 / 源像素，原画为逻辑 3 倍） */
const HEAD_K = 0.85 / 3;
const HEAD_W = 112 * HEAD_K;
const HEAD_H = 128 * HEAD_K;
/** 每格下巴统一落在第 72 行 */
const HEAD_CHIN = 72 * HEAD_K;
/** 下巴陷入被单的深度，保证裁剪残边被被单完全盖住 */
const HEAD_SINK = 1.6;

/** 一枚从枕头边缘缓缓飘起又渐隐的小 z */
function FloatingZ({ left, top, unit, size, delay, active }: { left: number; top: number; unit: number; size: number; delay: number; active: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [active, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
    transform: [
      { translateX: Math.sin(t.value * Math.PI * 1.5) * 2.2 * unit },
      { translateY: -t.value * 11 * unit },
      { scale: 0.7 + t.value * 0.5 },
    ],
  }));
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left,
          top,
          fontSize: size,
          color: '#E9E3FF',
          fontWeight: '800',
          textShadowColor: 'rgba(20, 14, 40, 0.6)',
          textShadowRadius: 2,
        },
        style,
      ]}
    >
      z
    </Animated.Text>
  );
}

function SleepZ({ left, top, unit, delay, active }: { left: number; top: number; unit: number; delay: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      <FloatingZ left={left} top={top} unit={unit} size={Math.max(8, 4.2 * unit)} delay={delay} active={active} />
      <FloatingZ left={left} top={top} unit={unit} size={Math.max(7, 3.4 * unit)} delay={delay + 1300} active={active} />
    </>
  );
}
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

              {/* 夜晚：家人头像枕在床上真实的枕头上，下巴塞进房间原画的被单里（door & 顾并排睡在主卧双人床上） */}
              {night && roomSleepers.length > 0 ? (
                <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, nightStyle]}>
                  {room.sleepSlots.map(slot => {
                    if (!roomSleepers.includes(slot.resident)) return null;
                    const row = SLEEPER_ROW[slot.resident];
                    const cx = slot.x + slot.w / 2;
                    const tuck = slot.y + slot.h;
                    const isPicked = selectedSleeper === slot.resident;
                    return (
                      <View key={slot.resident} pointerEvents="none" style={StyleSheet.absoluteFill}>
                        {isPicked ? (
                          <View
                            style={{
                              position: 'absolute',
                              left: (slot.x - 1.5) * scale,
                              top: (slot.y - 1.5) * scale,
                              width: (slot.w + 3) * scale,
                              height: (slot.h + 3) * scale,
                              borderRadius: 4 * scale,
                              backgroundColor: 'rgba(247, 215, 138, 0.14)',
                              borderWidth: 1,
                              borderColor: 'rgba(247, 215, 138, 0.55)',
                            }}
                          />
                        ) : null}
                        {/* 枕头上的接触阴影 */}
                        <View
                          style={{
                            position: 'absolute',
                            left: (cx - 10) * scale,
                            top: (tuck - 10) * scale,
                            width: 20 * scale,
                            height: 10.6 * scale,
                            borderRadius: 10 * scale,
                            backgroundColor: 'rgba(50, 25, 45, 0.16)',
                          }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            left: (cx - HEAD_W / 2) * scale,
                            top: (tuck + HEAD_SINK - HEAD_CHIN) * scale,
                          }}
                        >
                          <AnimatedAtlas
                            source={SLEEP_HEADS}
                            columns={4}
                            rows={5}
                            frames={[row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3]}
                            holds={SLEEP_HOLDS}
                            width={HEAD_W * scale}
                            height={HEAD_H * scale}
                            active={visible && !sleeping}
                          />
                        </View>
                      </View>
                    );
                  })}

                  {/* 重新盖上一条原画被单：头像下巴“钻进被窝”，再加一道极淡的翻边高光与阴影 */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: room.sheetFold.x * scale,
                      top: room.sheetFold.y * scale,
                      width: room.sheetFold.w * scale,
                      height: room.sheetFold.h * scale,
                      overflow: 'hidden',
                    }}
                  >
                    <Image
                      source={ROOM_ART[roomId].night}
                      resizeMode="stretch"
                      fadeDuration={0}
                      style={{
                        position: 'absolute',
                        left: -room.sheetFold.x * scale,
                        top: -room.sheetFold.y * scale,
                        width: roomW,
                        height: HOUSE_ROOM.height * scale,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        left: 2 * scale,
                        right: 2 * scale,
                        top: 0,
                        height: Math.max(1, 0.6 * scale),
                        backgroundColor: 'rgba(255, 238, 246, 0.24)',
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        left: 2 * scale,
                        right: 2 * scale,
                        top: 0.7 * scale,
                        height: Math.max(1, 0.6 * scale),
                        backgroundColor: 'rgba(60, 28, 48, 0.2)',
                      }}
                    />
                  </View>

                  {/* 飘起的小 z、点选名字气泡与点击热区 */}
                  {room.sleepSlots.map((slot, index) => {
                    if (!roomSleepers.includes(slot.resident)) return null;
                    const isPicked = selectedSleeper === slot.resident;
                    return (
                      <Pressable
                        key={`${slot.resident}-hit`}
                        accessibilityRole="button"
                        accessibilityLabel={`正在熟睡的${RESIDENTS[slot.resident].name}，点击查看梦话或互动`}
                        onPress={() => setSelectedSleeper(prev => (prev === slot.resident ? null : slot.resident))}
                        style={{
                          position: 'absolute',
                          left: (slot.x - 2) * scale,
                          top: (slot.y - 4) * scale,
                          width: (slot.w + 4) * scale,
                          height: (slot.h + 10) * scale,
                        }}
                      >
                        <SleepZ
                          left={(slot.w - 1) * scale}
                          top={1 * scale}
                          unit={scale}
                          delay={index * 900}
                          active={visible && !sleeping}
                        />
                        {isPicked ? (
                          <Animated.View
                            entering={FadeIn.duration(160)}
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: -9 * scale,
                              alignItems: 'center',
                            }}
                          >
                            <View
                              style={{
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 99,
                                backgroundColor: 'rgba(28, 22, 36, 0.78)',
                                borderWidth: 1,
                                borderColor: 'rgba(247, 215, 138, 0.45)',
                              }}
                            >
                              <Text style={{ color: '#F7E2B0', fontSize: 9.5, fontWeight: '800' }}>
                                {RESIDENTS[slot.resident].name} · 熟睡中
                              </Text>
                            </View>
                          </Animated.View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </Animated.View>
              ) : null}
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

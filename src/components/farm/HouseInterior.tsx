import { FarmButton, FarmPaper, FarmText as Text } from './FarmSkin';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOUSE_ROOM } from '@/constants/farmMap';

export interface HouseInteriorProps {
  visible: boolean; night: boolean; day: number; clock: string; onClose: () => void; onSleep: () => void;
}
const DAY_ROOM = require('../../../assets/images/farm-house-interior-v2.png');
const NIGHT_ROOM = require('../../../assets/images/farm-house-interior-night-v2.png');

/** Pixel furniture is baked into the room art; only the bed hit area is native. */
export function HouseInterior({ visible, night, day, clock, onClose, onSleep }: HouseInteriorProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [sleeping, setSleeping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const light = useSharedValue(night ? 1 : 0);
  useEffect(() => { light.value = withTiming(night ? 1 : 0, { duration: 700 }); }, [night, light]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const nightStyle = useAnimatedStyle(() => ({ opacity: light.value }));
  const roomW = Math.max(160, Math.min(width - 24, 560, (height - insets.top - insets.bottom - 146) * HOUSE_ROOM.width / HOUSE_ROOM.height));
  const scale = roomW / HOUSE_ROOM.width;
  const close = () => { if (!sleeping) onClose(); };
  const sleep = () => {
    if (sleeping) return;
    setSleeping(true);
    timer.current = setTimeout(() => { setSleeping(false); onSleep(); }, 1200);
  };
  return <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
    {visible ? <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: night ? '#29313C' : '#F5EDD8' }}>
      <FarmPaper theme={night ? 'night' : 'house'} />
      <StatusBar style={night ? 'light' : 'dark'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
        <FarmButton onPress={close} disabled={sleeping} tone="paper" style={{ width: 44, paddingHorizontal: 0 }}><Ionicons name="chevron-back" size={20} color="#76583B" /></FarmButton>
        <View style={{ flex: 1 }}><Text variant="title" style={{ color: night ? '#F6EEDC' : '#655036', fontSize: 17, fontWeight: '800' }}>door &amp; 顾的小屋</Text><Text style={{ color: night ? '#BBC5B0' : '#8A785E', fontSize: 11, marginTop: 5 }}>第 {day} 天 · {clock} · {night ? '灯火温暖' : '阳光正好'}</Text></View>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: roomW, height: HOUSE_ROOM.height * scale, overflow: 'hidden', borderRadius: 2, backgroundColor: '#71472E' }}>
          <Image accessibilityLabel="像素小屋：窗户、书桌、台灯、书架、植物、相框、地毯、箱子与床铺" source={DAY_ROOM} resizeMode="stretch" fadeDuration={0} style={{ width: roomW, height: HOUSE_ROOM.height * scale }} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, nightStyle]}><Image source={NIGHT_ROOM} resizeMode="stretch" fadeDuration={0} style={{ width: roomW, height: HOUSE_ROOM.height * scale }} /></Animated.View>
          <Pressable accessibilityRole="button" accessibilityLabel="床铺，睡觉" disabled={sleeping} onPress={sleep}
            style={{ position: 'absolute', left: HOUSE_ROOM.bed.x * scale, top: HOUSE_ROOM.bed.y * scale, width: HOUSE_ROOM.bed.w * scale, height: HOUSE_ROOM.bed.h * scale }} />
        </View>
        <Text style={{ color: night ? '#E4D6B5' : '#76583B', fontSize: 13, marginTop: 16 }}>轻点绿色床铺，睡个好觉</Text>
      </View>
      <Text style={{ color: night ? '#AABAA5' : '#8A785E', fontSize: 11, textAlign: 'center', lineHeight: 18, padding: 16 }}>休息一觉，作物加速生长；窗外天色跟随本地时间</Text>
      {sleeping ? <Animated.View entering={FadeIn.duration(240)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,10,22,0.96)', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="moon" size={34} color="#F5C466" /><Text style={{ color: '#F6EEDC', fontSize: 23, marginTop: 16, letterSpacing: 6 }}>Z z z …</Text><Text style={{ color: '#AEB9B0', fontSize: 12, marginTop: 12 }}>休息一下，等作物长大</Text></Animated.View> : null}
    </View> : null}
  </Modal>;
}

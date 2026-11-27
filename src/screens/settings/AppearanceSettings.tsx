import Ionicons from "@expo/vector-icons/Ionicons";
import { colorScheme } from "nativewind";
import React from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { GlassMaterialPreview } from "@/components/GlassMaterialPreview";
import {
  BACKGROUND_PRESETS,
  type BackgroundEffect,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { pickImageForBackground } from "@/services/fileImport";
import { useSettings, type CardMaterial } from "@/store/useSettings";

import { useCardEnter } from "./SettingsShared";

const APPEARANCES = [
  { key: "system", label: "跟随系统", icon: "phone-portrait" },
  { key: "light", label: "浅色", icon: "sunny" },
  { key: "dark", label: "深色", icon: "moon" },
] as const;

const MATERIALS = [
  { key: "glass", label: "液态玻璃", hint: "通透折射与镜面反光" },
  { key: "frosted", label: "柔雾玻璃", hint: "奶润柔光磨砂质感" },
  { key: "clear", label: "清透", hint: "零模糊纯净透色" },
  { key: "flat", label: "扁平", hint: "简洁清晰" },
] as const;

const MATERIAL_LABELS: Record<CardMaterial, string> = {
  glass: "液态玻璃",
  frosted: "柔雾玻璃",
  clear: "清透",
  flat: "扁平",
};

const BG_TINTS = Object.entries(BACKGROUND_PRESETS) as [
  BackgroundTint,
  (typeof BACKGROUND_PRESETS)[BackgroundTint],
][];

const BG_EFFECTS: { key: BackgroundEffect; label: string; hint: string }[] = [
  { key: "aurora", label: "极光柔光", hint: "柔和径向光场" },
  { key: "plain", label: "纯净渐变", hint: "安静极简底色" },
];

const BG_DIM_LEVELS = [
  { value: 0, label: "原图" },
  { value: 0.18, label: "轻柔" },
  { value: 0.35, label: "适中" },
  { value: 0.52, label: "深邃" },
] as const;

export function AppearanceSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(50);
  const enter2 = useCardEnter(100);
  const appearance = useSettings((s) => s.appearance);
  const material = useSettings((s) => s.material);
  const setMaterial = useSettings((s) => s.setMaterial);
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const setBackgroundImage = useSettings((s) => s.setBackgroundImage);
  const backgroundDim = useSettings((s) => s.backgroundDim);
  const setBackgroundDim = useSettings((s) => s.setBackgroundDim);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const backgroundEffect = useSettings((s) => s.backgroundEffect);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const setAppearance = useSettings((s) => s.setAppearance);

  const applyAppearance = (a: typeof appearance) => {
    setAppearance(a);
    colorScheme.set(a);
  };

  return (
    <>
      {/* 外观 */}
      <Animated.View entering={enter0}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
              外观
            </Text>
            <View className="flex-row gap-x-2.5">
              {APPEARANCES.map((a) => {
                const on = appearance === a.key;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => applyAppearance(a.key)}
                    className={`flex-1 items-center rounded-2xl border py-3 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/15 dark:bg-white/[0.06]"
                    }`}
                  >
                    <Ionicons
                      name={a.icon}
                      size={18}
                      color={on ? "#0EA5E9" : "#94A3B8"}
                    />
                    <Text
                      className={`mt-1 text-[11px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 材质 */}
      <Animated.View entering={enter1} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              材质
            </Text>
            <Text className="mb-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              液态玻璃带真实模糊与边缘微折射；柔雾玻璃呈现奶润柔光磨砂；清透无模糊更轻盈通透；扁平简洁清晰。
            </Text>
            <View className="flex-row flex-wrap justify-between gap-y-3">
              {MATERIALS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMaterial(m.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${m.label}，${m.hint}`}
                  accessibilityState={{ checked: material === m.key }}
                  style={{ width: "48%" }}
                >
                  <View
                    className={`rounded-[20px] border-2 p-0.5 ${
                      material === m.key
                        ? "border-sky-500 dark:border-sky-400"
                        : "border-transparent"
                    }`}
                  >
                    <GlassMaterialPreview material={m.key} />
                  </View>
                  <Text
                    className={`mt-1.5 text-center text-[12px] font-semibold ${
                      material === m.key
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 背景色调、光效与自定义背景图 */}
      <Animated.View entering={enter2} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              背景氛围与壁纸
            </Text>
            <Text className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              可自由切换 6 套主题色调与柔光光效，或上传自定义背景图
            </Text>

            {/* 6 套背景色调 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              默认背景色调
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {BG_TINTS.map(([key, preset]) => {
                const on = backgroundTint === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setBackgroundTint(key)}
                    style={{ width: "31%" }}
                    className={`flex-row items-center rounded-xl border px-2.5 py-2 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/18"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: `rgb(${preset.glowRgb[0]})`,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      className={`ml-2 flex-1 text-[11px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 光效 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              背景光效
            </Text>
            <View className="mb-4 flex-row gap-2.5">
              {BG_EFFECTS.map((eff) => {
                const on = backgroundEffect === eff.key;
                return (
                  <Pressable
                    key={eff.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setBackgroundEffect(eff.key)}
                    className={`flex-1 rounded-xl border px-3 py-2 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/18"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {eff.label}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {eff.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 自定义背景图 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              自定义背景图
            </Text>
            <View className="flex-row items-center gap-x-3">
              <View className="h-16 w-24 overflow-hidden rounded-2xl border border-slate-300/35 dark:border-white/10">
                {backgroundImage ? (
                  <Image
                    source={{ uri: backgroundImage }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center bg-white/25 dark:bg-white/[0.05]">
                    <Ionicons name="image-outline" size={18} color="#94A3B8" />
                  </View>
                )}
              </View>
              <View className="flex-1 gap-y-2">
                <Pressable
                  onPress={async () => {
                    try {
                      const img = await pickImageForBackground();
                      if (img) setBackgroundImage(img.uri);
                    } catch {
                      Alert.alert("无法读取图片", "请检查相册权限后重试。");
                    }
                  }}
                  className="items-center rounded-2xl bg-sky-500 py-2.5"
                >
                  <Text className="text-[12px] font-bold text-white">
                    {backgroundImage ? "更换背景图" : "上传背景图"}
                  </Text>
                </Pressable>
                {backgroundImage ? (
                  <Pressable
                    onPress={() => setBackgroundImage(null)}
                    className="items-center rounded-2xl border border-slate-300/35 bg-white/25 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      恢复默认渐变
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {backgroundImage ? (
              <View className="mt-3">
                <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  壁纸遮罩浓度（提升课表文字清晰度）
                </Text>
                <View className="flex-row gap-2">
                  {BG_DIM_LEVELS.map((lvl) => {
                    const on = Math.abs(backgroundDim - lvl.value) < 0.05;
                    return (
                      <Pressable
                        key={lvl.label}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => setBackgroundDim(lvl.value)}
                        className={`flex-1 items-center rounded-xl border py-2 ${
                          on
                            ? "border-sky-500/75 bg-sky-500/20"
                            : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold ${
                            on
                              ? "text-sky-700 dark:text-sky-300"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {lvl.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text className="mt-2.5 text-[10.5px] text-slate-500 dark:text-slate-400">
              当前卡片材质为「{MATERIAL_LABELS[material] ?? "扁平"}」，背景会铺满整个应用界面。
            </Text>
          </View>
        </GlassContainer>
      </Animated.View>
    </>
  );
}

export default AppearanceSettings;

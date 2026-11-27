import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, router } from "expo-router";
import React, { Suspense, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { playSfx, playStarScaleNote } from "@/services/soundEffects";
import { currentVersion } from "@/services/updater";
import {
  advanceTapSequence,
  INITIAL_TAP_SEQUENCE,
} from "@/utils/ambientCraft";
import { selectHaptic, thumpHaptic } from "@/utils/haptics";

import {
  SettingsCategoryFallback,
  SettingsOverview,
  SettingsPage,
  UpdateCard,
  useCardEnter,
} from "./settings/SettingsShared";

const LazyScheduleSemesterSettings = React.lazy(
  () => import("./settings/ScheduleSemesterSettings"),
);
const LazyReminderWidgetSettings = React.lazy(
  () => import("./settings/ReminderWidgetSettings"),
);
const LazyAppearanceSettings = React.lazy(
  () => import("./settings/AppearanceSettings"),
);
const LazyAiPetSettings = React.lazy(() => import("./settings/AiPetSettings"));
const LazyBackupSyncSettings = React.lazy(
  () => import("./settings/BackupSyncSettings"),
);
const LazyPerformanceDiagSettings = React.lazy(
  () => import("./settings/PerformanceDiagSettings"),
);
const LazyAmbientCraftModal = React.lazy(() =>
  import("@/components/AmbientCraft").then((m) => ({
    default: m.AmbientCraftModal,
  })),
);

/** 按高频使用顺序排列：核心课表与提醒置顶，低频备份与性能诊断靠后 */
const SETTINGS_GROUPS = [
  {
    id: "schedule",
    title: "课表与学期",
    description: "显示偏好、作息时间、学期日期与多课表",
    icon: "calendar-outline",
    Content: LazyScheduleSemesterSettings,
  },
  {
    id: "reminders",
    title: "提醒与小组件",
    description: "上课提醒、手机闹钟/日程与桌面小组件",
    icon: "notifications-outline",
    Content: LazyReminderWidgetSettings,
  },
  {
    id: "appearance",
    title: "外观与背景",
    description: "深浅色、材质、6 套背景色调与自定义壁纸",
    icon: "color-palette-outline",
    Content: LazyAppearanceSettings,
  },
  {
    id: "ai",
    title: "AI 与桌宠",
    description: "多服务商连接测试、模型配置、人设与记忆",
    icon: "sparkles-outline",
    Content: LazyAiPetSettings,
  },
  {
    id: "backup",
    title: "备份与恢复",
    description: "导入导出备份与重置全部数据",
    icon: "save-outline",
    Content: LazyBackupSyncSettings,
  },
  {
    id: "performance",
    title: "性能与诊断",
    description: "画面表现、保存状态与请求耗时",
    icon: "speedometer-outline",
    Content: LazyPerformanceDiagSettings,
  },
] as const;

export function SettingsScreen() {
  const enterList = useCardEnter(50);
  const [ambientOpen, setAmbientOpen] = useState(false);
  const versionTapRef = useRef(INITIAL_TAP_SEQUENCE);
  const appVersion = currentVersion();

  const handleVersionTap = () => {
    const res = advanceTapSequence(versionTapRef.current, Date.now(), {
      targetCount: 5,
      windowMs: 2400,
    });
    versionTapRef.current = res.next;
    if (res.triggered) {
      thumpHaptic();
      playSfx("star_constellation", { volume: 0.66 });
      setAmbientOpen(true);
    } else if (res.next.count >= 3) {
      selectHaptic();
      playStarScaleNote(res.next.count - 3, { volume: 0.34 });
    }
  };

  return (
    <SettingsPage
      title="设置"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SettingsOverview />
      <Animated.View entering={enterList} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          {SETTINGS_GROUPS.map((group, index) => (
            <Link
              key={group.id}
              href={{
                pathname: "/settings/[category]",
                params: { category: group.id },
              }}
              asChild
            >
              <Pressable
                className="min-h-[70px] flex-row items-center gap-3 px-4 py-2.5 active:bg-sky-400/15"
                style={
                  index > 0
                    ? {
                        borderTopWidth: 1,
                        borderTopColor: "rgba(148,163,184,0.2)",
                      }
                    : undefined
                }
              >
                <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-sky-400/20">
                  <Ionicons name={group.icon} size={19} color="#0EA5E9" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                    {group.title}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                    {group.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </Pressable>
            </Link>
          ))}
        </GlassContainer>
      </Animated.View>
      <UpdateCard />
      <Pressable onPress={handleVersionTap}>
        <Text className="mt-5 text-center text-[11px] text-slate-500 dark:text-slate-400">
          Dark Study v{appVersion}
        </Text>
      </Pressable>
      {ambientOpen ? (
        <Suspense fallback={null}>
          <LazyAmbientCraftModal
            visible
            kind="musicbox"
            context={{ version: appVersion }}
            onClose={() => setAmbientOpen(false)}
          />
        </Suspense>
      ) : null}
    </SettingsPage>
  );
}

export function SettingsCategoryScreen({ category }: { category: string }) {
  const group = SETTINGS_GROUPS.find((item) => item.id === category);
  const Content = group?.Content;

  return (
    <SettingsPage
      title={group?.title ?? "设置"}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/settings")
      }
    >
      {Content ? (
        <Suspense fallback={<SettingsCategoryFallback />}>
          <Content />
        </Suspense>
      ) : (
        <Link
          href="/settings"
          replace
          className="py-3 text-sky-700 dark:text-sky-300"
        >
          返回设置
        </Link>
      )}
    </SettingsPage>
  );
}

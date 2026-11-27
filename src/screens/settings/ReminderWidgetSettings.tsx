import React, { Suspense, useRef } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import Animated from "react-native-reanimated";

import { CourseReminderSettings } from "@/components/CourseReminderSettings";
import { GlassContainer } from "@/components/GlassContainer";
import { ensureReminderPermission } from "@/services/courseReminders";
import { useSettings } from "@/store/useSettings";

import {
  SettingsCategoryFallback,
  ToggleRow,
  useCardEnter,
} from "./SettingsShared";

const LazyCourseWidgetSettings = React.lazy(() =>
  import("@/components/CourseWidgetSettings").then((m) => ({
    default: m.CourseWidgetSettings,
  })),
);

export function ReminderWidgetSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(50);
  const enter2 = useCardEnter(100);
  const liveClassNotification = useSettings((s) => s.liveClassNotification);
  const setLiveClassNotification = useSettings(
    (s) => s.setLiveClassNotification,
  );
  const requestingLivePermRef = useRef(false);

  const toggleLiveClassNotification = async (next: boolean) => {
    if (!next) {
      setLiveClassNotification(false);
      return;
    }
    if (Platform.OS !== "web") {
      if (requestingLivePermRef.current) return;
      requestingLivePermRef.current = true;
      try {
        const granted = await ensureReminderPermission();
        if (!granted) {
          Alert.alert(
            "需要通知权限",
            "请在系统设置中允许 Dark Study 发送通知。",
            [
              { text: "取消", style: "cancel" },
              {
                text: "打开设置",
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ],
          );
          return;
        }
      } catch {
        Alert.alert("无法开启通知", "请检查系统通知权限后重试。");
        return;
      } finally {
        requestingLivePermRef.current = false;
      }
    }
    setLiveClassNotification(true);
  };

  return (
    <>
      <Animated.View entering={enter0}>
        <CourseReminderSettings />
      </Animated.View>
      <Animated.View entering={enter1} style={{ marginBottom: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-3">
            <ToggleRow
              label="常驻上课进度通知"
              hint="课前准备与上课期间在通知栏实时展示当前课程剩余时间与进度"
              value={liveClassNotification}
              onValueChange={(v) => {
                void toggleLiveClassNotification(v);
              }}
            />
          </View>
        </GlassContainer>
      </Animated.View>
      <Animated.View entering={enter2}>
        <Suspense
          fallback={<SettingsCategoryFallback label="加载桌面小组件设置…" />}
        >
          <LazyCourseWidgetSettings />
        </Suspense>
      </Animated.View>
    </>
  );
}

export default ReminderWidgetSettings;

import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { useStore } from "@/store/useStore";
import { countDistinctCourses } from "@/utils/time";

export interface ScheduleSwitcherModalProps {
  onClose: () => void;
}

export function ScheduleSwitcherModal({
  onClose,
}: ScheduleSwitcherModalProps) {
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const reducedMotion = useReducedMotion();
  const { height: winH } = useWindowDimensions();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInDown.duration(200).easing(Easing.out(Easing.cubic))
            }
          >
            <GlassContainer
              variant="sheet"
              radius={32}
              borderOpacity={0.3}
              style={{ paddingBottom: 24 }}
            >
              <View className="px-5 pt-5">
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                    切换课程表
                  </Text>
                  <Pressable
                    onPress={onClose}
                    className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                  >
                    <Ionicons name="close" size={16} color="#64748B" />
                  </Pressable>
                </View>

                <ScrollView
                  style={{ maxHeight: winH * 0.45 }}
                  showsVerticalScrollIndicator={false}
                >
                  {schedules.map((item) => {
                    const isActive = item.id === activeScheduleId;
                    const distinctCount = countDistinctCourses(item.courses);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setActiveSchedule(item.id);
                          onClose();
                        }}
                        className={`mb-2 flex-row items-center rounded-2xl border px-3.5 py-2.5 ${
                          isActive
                            ? "border-sky-400/60 bg-sky-400/15"
                            : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                            {item.name}
                          </Text>
                          <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                            {distinctCount} 门课
                            {item.courses.length !== distinctCount
                              ? `（${item.courses.length} 条安排）`
                              : ""}{" "}
                            · 共 {item.totalWeeks} 周
                          </Text>
                        </View>
                        {isActive ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#38BDF8"
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => {
                    onClose();
                    router.push("/settings/schedule");
                  }}
                  className="mt-2 items-center rounded-2xl border border-slate-300/35 bg-white/25 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Text className="text-[12px] font-semibold text-sky-600 dark:text-sky-300">
                    管理课程表（新建 / 复制 / 重命名 / 删除）
                  </Text>
                </Pressable>
              </View>
            </GlassContainer>
          </Animated.View>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}

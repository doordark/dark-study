import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import {
  cancelFocusCompletionNotification,
  scheduleFocusCompletionNotification,
} from "@/services/courseReminders";
import { playSfx, type SfxId } from "@/services/soundEffects";
import {
  useStudyProgress,
  type FocusSessionCompletion,
} from "@/store/useStudyProgress";
import { successHaptic, tapHaptic } from "@/utils/haptics";
import {
  computeFocusRemainingSec,
  formatFocusCountdown,
  type ActiveFocusSession,
} from "@/utils/studyProgress";

export interface FocusMiniBannerProps {
  isDark: boolean;
  onOpenModal: () => void;
  onSessionFinished?: (completion: FocusSessionCompletion) => void;
}

const AMBIENT_CHIME_NOTES: readonly SfxId[] = [
  "star_note_1",
  "star_note_3",
  "star_note_5",
  "star_note_6",
];
const AMBIENT_CHIME_INTERVAL_MS = 45_000;

export function FocusMiniBanner({
  isDark,
  onOpenModal,
  onSessionFinished,
}: FocusMiniBannerProps) {
  const activeFocusSession = useStudyProgress((s) => s.activeFocusSession);
  const pauseFocusSession = useStudyProgress((s) => s.pauseFocusSession);
  const resumeFocusSession = useStudyProgress((s) => s.resumeFocusSession);
  const tickOrSyncFocusSession = useStudyProgress(
    (s) => s.tickOrSyncFocusSession,
  );
  const completeActiveFocusSession = useStudyProgress(
    (s) => s.completeActiveFocusSession,
  );
  const setFocusNotificationId = useStudyProgress(
    (s) => s.setFocusNotificationId,
  );

  const reducedMotion = useReducedMotion();
  const [clockNow, setClockNow] = useState<number>(() => Date.now());
  const ambientIdxRef = useRef(0);

  const activeId = activeFocusSession?.id ?? null;
  const isRunning = activeFocusSession?.running ?? false;
  const ambientOn = activeFocusSession?.ambientOn ?? false;

  const scheduleForSession = useCallback(
    async (session: ActiveFocusSession) => {
      if (!session.running || !session.endAt) return;
      const mins = Math.max(1, Math.round(session.totalSec / 60));
      const title =
        session.mode === "break"
          ? "短休结束 · 准备回到学习"
          : `${session.courseName} 专注完成`;
      const body =
        session.mode === "break"
          ? `${mins} 分钟短休已结束，回来开启下一轮番茄钟吧！`
          : `已完成 ${mins} 分钟专注，doordoor农场 dark币 已存入奖励箱！`;
      const notifId = await scheduleFocusCompletionNotification(
        session.endAt,
        title,
        body,
      );
      if (!notifId) return;
      const latest = useStudyProgress.getState().activeFocusSession;
      if (latest && latest.id === session.id && latest.running) {
        setFocusNotificationId(session.id, notifId);
      } else {
        await cancelFocusCompletionNotification(notifId);
      }
    },
    [setFocusNotificationId],
  );

  const handleNaturalFinish = useCallback(() => {
    const current = useStudyProgress.getState().activeFocusSession;
    if (!current) return;
    const prevNotifId = current.notificationId;
    const result = completeActiveFocusSession({ early: false });
    if (!result) return;
    void cancelFocusCompletionNotification(prevNotifId);
    successHaptic();
    playSfx(
      result.mode === "break" ? "whale_ui_ripple" : "star_constellation",
      {
        volume: result.mode === "break" ? 0.45 : 0.56,
        ignoreCooldown: true,
        bypassToggle: true,
      },
    );
    onSessionFinished?.(result);
  }, [completeActiveFocusSession, onSessionFinished]);

  useEffect(() => {
    if (!activeId) return;
    const syncOnce = () => {
      const now = Date.now();
      setClockNow(now);
      const synced = tickOrSyncFocusSession(now);
      if (synced.completed) {
        handleNaturalFinish();
      }
    };
    const initTimer = setTimeout(syncOnce, 0);
    const interval = isRunning ? setInterval(syncOnce, 500) : null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncOnce();
    });
    return () => {
      clearTimeout(initTimer);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, [activeId, handleNaturalFinish, isRunning, tickOrSyncFocusSession]);

  // 弹窗关闭后，若开启轻音伴读仍在前台轻柔提示，停止/卸载即清理
  useEffect(() => {
    if (!isRunning || !ambientOn) return;
    const timer = setInterval(() => {
      const note =
        AMBIENT_CHIME_NOTES[ambientIdxRef.current % AMBIENT_CHIME_NOTES.length];
      ambientIdxRef.current += 1;
      playSfx(note, {
        volume: 0.2,
        ignoreCooldown: true,
        bypassToggle: true,
      });
    }, AMBIENT_CHIME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ambientOn, isRunning]);

  if (!activeFocusSession) return null;

  const remainingSec = computeFocusRemainingSec(activeFocusSession, clockNow);
  const progressRatio = Math.min(
    1,
    Math.max(
      0,
      (activeFocusSession.totalSec - remainingSec) /
        Math.max(1, activeFocusSession.totalSec),
    ),
  );
  const isBreak = activeFocusSession.mode === "break";
  const modeLabel = isRunning
    ? isBreak
      ? "短休中"
      : "专注中"
    : isBreak
      ? "短休暂停"
      : "已暂停";

  const handleTogglePause = () => {
    tapHaptic();
    if (activeFocusSession.running) {
      const prevNotifId = activeFocusSession.notificationId;
      pauseFocusSession();
      void cancelFocusCompletionNotification(prevNotifId);
    } else {
      const resumed = resumeFocusSession();
      if (resumed) {
        setClockNow(Date.now());
        void scheduleForSession(resumed);
      }
    }
  };

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(180)}
      exiting={reducedMotion ? undefined : FadeOut.duration(150)}
      className="px-4 pt-1.5"
    >
      <GlassContainer radius={18} intensity={44} borderOpacity={0.26}>
        <View className="flex-row items-center px-3 py-2">
          <Pressable
            onPress={() => {
              tapHaptic();
              onOpenModal();
            }}
            accessibilityRole="button"
            accessibilityLabel={`打开${modeLabel}：${activeFocusSession.courseName}，剩余 ${formatFocusCountdown(remainingSec)}`}
            className="min-w-0 flex-1 flex-row items-center"
          >
            <View
              className={`mr-2 flex-row items-center rounded-full border px-2 py-0.5 ${
                !isRunning
                  ? "border-amber-400/50 bg-amber-500/18"
                  : isBreak
                    ? "border-emerald-400/50 bg-emerald-500/18"
                    : "border-sky-400/50 bg-sky-500/18"
              }`}
            >
              <Ionicons
                name={isBreak ? "cafe-outline" : "timer-outline"}
                size={11}
                color={
                  !isRunning ? "#F59E0B" : isBreak ? "#10B981" : "#0EA5E9"
                }
              />
              <Text
                className={`ml-1 text-[10px] font-bold ${
                  !isRunning
                    ? "text-amber-700 dark:text-amber-300"
                    : isBreak
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-sky-700 dark:text-sky-300"
                }`}
              >
                {modeLabel}
              </Text>
            </View>

            <Text
              numberOfLines={1}
              className="flex-1 text-[12px] font-bold text-slate-800 dark:text-slate-100"
            >
              {activeFocusSession.courseName}
            </Text>

            {ambientOn ? (
              <Ionicons
                name="musical-notes"
                size={11.5}
                color={isDark ? "#C4B5FD" : "#7C3AED"}
                style={{ marginLeft: 4 }}
              />
            ) : null}

            <Text
              className={`ml-2 shrink-0 text-[13px] font-black tracking-wider ${
                !isRunning
                  ? "text-amber-600 dark:text-amber-300"
                  : isBreak
                    ? "text-emerald-600 dark:text-emerald-300"
                    : "text-sky-600 dark:text-sky-300"
              }`}
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {formatFocusCountdown(remainingSec)}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleTogglePause}
            accessibilityRole="button"
            accessibilityLabel={isRunning ? "暂停计时" : "继续计时"}
            hitSlop={8}
            className={`ml-2 h-7 w-7 items-center justify-center rounded-full ${
              isRunning
                ? "bg-amber-500/20"
                : isBreak
                  ? "bg-emerald-500/20"
                  : "bg-sky-500/20"
            }`}
          >
            <Ionicons
              name={isRunning ? "pause" : "play"}
              size={13}
              color={
                isRunning ? "#F59E0B" : isBreak ? "#10B981" : "#0EA5E9"
              }
            />
          </Pressable>
        </View>

        {/* 底部极细进度条 */}
        <View className="h-[2.5px] w-full bg-slate-300/25 dark:bg-white/[0.08]">
          <View
            className={`h-full ${
              !isRunning
                ? "bg-amber-400"
                : isBreak
                  ? "bg-emerald-500"
                  : "bg-sky-500"
            }`}
            style={{ width: `${Math.round(progressRatio * 100)}%` }}
          />
        </View>
      </GlassContainer>
    </Animated.View>
  );
}

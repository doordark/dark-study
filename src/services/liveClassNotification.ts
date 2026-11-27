import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Schedule } from "@/types";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

export const LIVE_CLASS_CHANNEL_ID = "course-live-status";
export const LIVE_CLASS_NOTIFICATION_ID = "dark-study-live-class";
export const LIVE_CLASS_NOTIFICATION_KIND = "dark-study-live-class";

export interface LiveClassBanner {
  active: boolean;
  phase: "upcoming" | "ongoing" | "idle";
  courseId?: string;
  week?: number;
  courseName?: string;
  classroom?: string;
  progressPct?: number;
  remainingMinutes?: number;
  title: string;
  body: string;
  nextRefreshAt: number | null;
}

interface CourseOccurrence {
  courseId: string;
  week: number;
  name: string;
  classroom: string;
  start: number;
  end: number;
}

function parseClockMinutes(value: string | undefined): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}

function idleBanner(): LiveClassBanner {
  return {
    active: false,
    phase: "idle",
    title: "",
    body: "",
    nextRefreshAt: null,
  };
}

function nextMinuteBoundary(nowMs: number): number {
  return Math.floor(nowMs / 60_000) * 60_000 + 60_000;
}

/**
 * 纯函数：根据当前课表与时间计算「常驻/实况上课进度通知」内容。
 * - 上课中（start <= now < end）：返回进度百分比与距下课分钟数
 * - 即将上课（0 < start - now <= preMinutes）：返回开课倒计时
 * - 其余时段：返回 idle
 */
export function buildLiveClassBanner(
  schedule: Schedule | undefined,
  now = new Date(),
  preMinutes = 15,
): LiveClassBanner {
  const nowMs = now.getTime();
  if (!schedule || !Number.isFinite(nowMs)) return idleBanner();
  const monday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(monday.getTime())) return idleBanner();

  const leadMinutes = Number.isFinite(preMinutes)
    ? Math.max(1, Math.min(120, Math.round(preMinutes)))
    : 15;
  const leadMs = leadMinutes * 60_000;

  const candidates: CourseOccurrence[] = [];
  for (const course of schedule.courses) {
    if (
      !Number.isInteger(course.weekday) ||
      course.weekday < 1 ||
      course.weekday > 7
    ) {
      continue;
    }
    const first = schedule.periods.find((p) => p.index === course.startPeriod);
    const last = schedule.periods.find((p) => p.index === course.endPeriod);
    const from = parseClockMinutes(course.startTime?.trim() || first?.startTime?.trim());
    const to = parseClockMinutes(course.endTime?.trim() || last?.endTime?.trim());
    if (from === null || to === null || to <= from) continue;

    for (const week of new Set(course.weeks)) {
      if (!Number.isInteger(week) || week < 1 || week > schedule.totalWeeks) {
        continue;
      }
      const day = addDays(monday, (week - 1) * 7 + course.weekday - 1);
      const iso = toIsoDate(day);
      if (iso < schedule.startDate || iso > schedule.endDate) continue;

      const start = new Date(day);
      const end = new Date(day);
      start.setHours(Math.floor(from / 60), from % 60, 0, 0);
      end.setHours(Math.floor(to / 60), to % 60, 0, 0);
      const startMs = start.getTime();
      const endMs = end.getTime();

      if (endMs <= nowMs) continue;
      if (startMs > nowMs + leadMs) continue;

      candidates.push({
        courseId: course.id,
        week,
        name: course.name,
        classroom: (course.classroom ?? "").trim(),
        start: startMs,
        end: endMs,
      });
    }
  }

  if (candidates.length === 0) return idleBanner();
  candidates.sort(
    (a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name),
  );

  const ongoing = candidates.find((c) => c.start <= nowMs && nowMs < c.end);
  if (ongoing) {
    const durationMs = ongoing.end - ongoing.start;
    const progressPct = Math.max(
      0,
      Math.min(100, Math.round(((nowMs - ongoing.start) / durationMs) * 100)),
    );
    const remainingMinutes = Math.max(
      1,
      Math.ceil((ongoing.end - nowMs) / 60_000),
    );
    const classroom = ongoing.classroom;
    return {
      active: true,
      phase: "ongoing",
      courseId: ongoing.courseId,
      week: ongoing.week,
      courseName: ongoing.name,
      classroom,
      progressPct,
      remainingMinutes,
      title: `正在上课 · ${ongoing.name}`,
      body: `${classroom ? `${classroom} · ` : ""}距下课 ${remainingMinutes} 分钟（进度 ${progressPct}%）`,
      nextRefreshAt: Math.min(nextMinuteBoundary(nowMs), ongoing.end),
    };
  }

  const upcoming = candidates.find(
    (c) => c.start > nowMs && c.start - nowMs <= leadMs,
  );
  if (upcoming) {
    const remainingMinutes = Math.max(
      1,
      Math.ceil((upcoming.start - nowMs) / 60_000),
    );
    const classroom = upcoming.classroom;
    return {
      active: true,
      phase: "upcoming",
      courseId: upcoming.courseId,
      week: upcoming.week,
      courseName: upcoming.name,
      classroom,
      remainingMinutes,
      title: `即将上课 · ${upcoming.name}`,
      body: `${remainingMinutes} 分钟后开始${classroom ? ` · ${classroom}` : ""}`,
      nextRefreshAt: Math.min(nextMinuteBoundary(nowMs), upcoming.start),
    };
  }

  return idleBanner();
}

export async function prepareLiveClassChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(LIVE_CLASS_CHANNEL_ID, {
    name: "上课实况进度",
    description: "上课前与上课中在通知栏低打扰常驻显示课程进度",
    // Expo exports this enum at runtime; ESLint cannot resolve the package barrel.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
    showBadge: false,
  });
}

async function dismissLiveNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(LIVE_CLASS_NOTIFICATION_ID);
  } catch {
    // 通知可能已被用户划掉或尚未展示
  }
}

let liveQueue: Promise<void> = Promise.resolve();
let liveGeneration = 0;

/**
 * 同步单条确定性实况上课进度通知（`dark-study-live-class`）。
 * - Web 端直接静默跳过
 * - 关闭或处于无课空闲时段时自动移除常驻通知
 * - 开启且处于即将上课 / 上课中时静默原地更新进度条文案
 */
export function syncLiveClassNotification(
  schedule: Schedule | undefined,
  enabled: boolean,
  preMinutes = 15,
  now = new Date(),
): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  const current = ++liveGeneration;
  liveQueue = liveQueue
    .catch(() => {})
    .then(async () => {
      if (current !== liveGeneration) return;
      const banner = enabled
        ? buildLiveClassBanner(schedule, now, preMinutes)
        : idleBanner();

      if (!enabled || !banner.active) {
        await dismissLiveNotification();
        return;
      }

      const perm =
        typeof Notifications.getPermissionsAsync === "function"
          ? await Notifications.getPermissionsAsync()
          : { granted: true };
      if (current !== liveGeneration) return;
      if (!perm?.granted) {
        await dismissLiveNotification();
        return;
      }

      await prepareLiveClassChannel();
      if (current !== liveGeneration) return;

      await Notifications.scheduleNotificationAsync({
        identifier: LIVE_CLASS_NOTIFICATION_ID,
        content: {
          title: banner.title,
          body: banner.body,
          sound: false,
          sticky: true,
          autoDismiss: false,
          interruptionLevel: "passive",
          data: {
            kind: LIVE_CLASS_NOTIFICATION_KIND,
            courseId: banner.courseId,
            week: banner.week,
          },
        },
        trigger:
          Platform.OS === "android"
            ? { channelId: LIVE_CLASS_CHANNEL_ID }
            : null,
      });
    })
    .catch((error) => {
      console.warn("实况上课通知同步失败", error);
    });
  return liveQueue;
}

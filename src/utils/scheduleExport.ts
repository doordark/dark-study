import { Platform, Share } from "react-native";

import { WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Schedule } from "@/types";
import { occurrenceDate } from "@/utils/courseEditing";
import {
  formatWeeksCompact,
  getCourseTime,
  weeksFromDates,
} from "@/utils/time";

const CLOCK_RE = /^\d{1,2}:\d{2}$/;

export interface ScheduleIcsBuild {
  ics: string;
  eventCount: number;
}

export interface ScheduleStats {
  /** 去重后的课程门数（按课程名 + 教师） */
  uniqueCourseCount: number;
  /** 课表记录条数（一周多时段/拆分调课分别计数） */
  slotCount: number;
  /** 去重后的总学分 */
  totalCredits: number;
  /** 整学期总上课次数 */
  totalSessions: number;
  /** 整学期总节数（学时） */
  totalClassHours: number;
  /** 整学期总授课时长（小时） */
  totalClockHours: number;
  /** 周一至周日的周均上课小时数（固定长度 7） */
  weeklyHoursByWeekday: number[];
  /** 最繁忙的星期（1=周一 ... 7=周日），无课时为 null */
  busiestWeekday: number | null;
  /** 第 1..totalWeeks 周每周的上课次数 */
  sessionsPerWeek: number[];
}

function resolveTotalWeeks(schedule: Schedule): number {
  if (Number.isInteger(schedule.totalWeeks) && schedule.totalWeeks >= 1) {
    return schedule.totalWeeks;
  }
  if (schedule.startDate && schedule.endDate) {
    return weeksFromDates(schedule.startDate, schedule.endDate);
  }
  return 18;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** RFC 5545 TEXT 属性值转义：反斜杠、换行、逗号、分号 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsLocalDateTime(dateIso: string, clock: string): string {
  const datePart = dateIso.replace(/-/g, "");
  const [hRaw, mRaw] = clock.split(":");
  const hh = String(Number(hRaw) || 0).padStart(2, "0");
  const mm = String(Number(mRaw) || 0).padStart(2, "0");
  return `${datePart}T${hh}${mm}00`;
}

function formatIcsUtcStamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function sanitizeUidToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_") || "item";
}

function buildScheduleIcs(schedule: Schedule, now = new Date()): ScheduleIcsBuild {
  const totalWeeks = resolveTotalWeeks(schedule);
  const dtStamp = formatIcsUtcStamp(now);
  const calName = escapeIcsText(schedule.name?.trim() || "Dark Study 课表");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dark Study//Timetable//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calName}`,
    "X-WR-TIMEZONE:Asia/Shanghai",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  interface EventEntry {
    sortKey: string;
    uid: string;
    dtStart: string;
    dtEnd: string;
    summary: string;
    location: string;
    description: string;
  }

  const events: EventEntry[] = [];

  for (const course of schedule.courses) {
    if (
      !Number.isInteger(course.weekday) ||
      course.weekday < 1 ||
      course.weekday > 7
    ) {
      continue;
    }

    const time = getCourseTime(
      schedule.periods,
      course.startPeriod,
      course.endPeriod,
      course,
    );
    if (!CLOCK_RE.test(time.startTime) || !CLOCK_RE.test(time.endTime)) {
      continue;
    }

    const uniqueWeeks = [...new Set(course.weeks)]
      .filter((w) => Number.isInteger(w) && w >= 1 && w <= totalWeeks)
      .sort((a, b) => a - b);

    const periodText =
      course.startPeriod === course.endPeriod
        ? `第${course.startPeriod}节`
        : `第${course.startPeriod}-${course.endPeriod}节`;
    const weekdayLabel = WEEKDAY_LABELS[course.weekday - 1] ?? `周${course.weekday}`;

    for (const week of uniqueWeeks) {
      const dateIso = occurrenceDate(schedule, week, course.weekday);
      if (schedule.startDate && dateIso < schedule.startDate) continue;
      if (schedule.endDate && dateIso > schedule.endDate) continue;

      const dtStart = formatIcsLocalDateTime(dateIso, time.startTime);
      const dtEnd = formatIcsLocalDateTime(dateIso, time.endTime);
      const descParts = [`第${week}周 · ${weekdayLabel} · ${periodText}`];
      if (course.teacher?.trim()) {
        descParts.push(`教师：${course.teacher.trim()}`);
      }
      if (typeof course.credits === "number" && Number.isFinite(course.credits)) {
        descParts.push(`学分：${course.credits}`);
      }
      if (course.note?.trim()) {
        descParts.push(`备注：${course.note.trim()}`);
      }

      events.push({
        sortKey: `${dtStart}|${course.name}|${course.id}`,
        uid: `${sanitizeUidToken(schedule.id)}-${sanitizeUidToken(course.id)}-w${week}-d${course.weekday}@darkstudy.app`,
        dtStart,
        dtEnd,
        summary: escapeIcsText(course.name),
        location: escapeIcsText(course.classroom?.trim() ?? ""),
        description: escapeIcsText(descParts.join("\n")),
      });
    }
  }

  events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;TZID=Asia/Shanghai:${ev.dtStart}`);
    lines.push(`DTEND;TZID=Asia/Shanghai:${ev.dtEnd}`);
    lines.push(`SUMMARY:${ev.summary}`);
    if (ev.location) {
      lines.push(`LOCATION:${ev.location}`);
    }
    lines.push(`DESCRIPTION:${ev.description}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return {
    ics: `${lines.join("\r\n")}\r\n`,
    eventCount: events.length,
  };
}

/** 导出标准 RFC 5545 `.ics` 日历文本（使用 CRLF 与 Asia/Shanghai 时区） */
export function exportScheduleToIcs(schedule: Schedule): string {
  return buildScheduleIcs(schedule).ics;
}

/** 将课表写入缓存 `.ics` 文件并唤起系统分享面板（Web 端走下载或文本分享回退） */
export async function shareScheduleIcsFile(
  schedule: Schedule,
): Promise<{ uri: string; eventCount: number }> {
  const { ics, eventCount } = buildScheduleIcs(schedule);
  const safeBase =
    (schedule.name || "schedule")
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .slice(0, 48) || "schedule";
  const fileName = `DarkStudy-${safeBase}.ics`;
  const title = `${schedule.name || "Dark Study"} 课表 (.ics)`;

  if (Platform.OS === "web") {
    if (
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof document !== "undefined"
    ) {
      const url = URL.createObjectURL(
        new Blob([ics], { type: "text/calendar;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { uri: url, eventCount };
    }
    await Share.share({ title, message: ics });
    return { uri: "", eventCount };
  }

  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(ics);

  if (Platform.OS === "ios") {
    await Share.share({ url: file.uri, title });
  } else {
    await Share.share({ title, message: ics });
  }

  return { uri: file.uri, eventCount };
}

/** 生成适合复制/分享的纯文本课表摘要（传入 week 时仅输出指定教学周） */
export function formatScheduleTextSummary(
  schedule: Schedule,
  week?: number,
): string {
  const totalWeeks = resolveTotalWeeks(schedule);
  const header =
    week != null
      ? `【${schedule.name} · 第 ${week} 周课表】`
      : `【${schedule.name} · 整学期课表】`;
  const sub = `${schedule.startDate} ~ ${schedule.endDate}（共 ${totalWeeks} 周）`;
  const lines: string[] = [header, sub];

  let count = 0;
  for (let day = 1; day <= 7; day++) {
    const dayCourses = schedule.courses
      .filter(
        (c) =>
          c.weekday === day && (week == null || c.weeks.includes(week)),
      )
      .sort(
        (a, b) =>
          a.startPeriod - b.startPeriod ||
          a.endPeriod - b.endPeriod ||
          a.name.localeCompare(b.name),
      );
    if (!dayCourses.length) continue;

    lines.push("", WEEKDAY_LABELS[day - 1] ?? `周${day}`);
    for (const c of dayCourses) {
      count += 1;
      const t = getCourseTime(schedule.periods, c.startPeriod, c.endPeriod, c);
      const periodText =
        c.startPeriod === c.endPeriod
          ? `第${c.startPeriod}节`
          : `第${c.startPeriod}-${c.endPeriod}节`;
      const meta: string[] = [];
      if (c.classroom?.trim()) meta.push(`@ ${c.classroom.trim()}`);
      if (c.teacher?.trim()) meta.push(c.teacher.trim());
      if (week == null) {
        const compactWeeks = formatWeeksCompact(c.weeks);
        if (compactWeeks) meta.push(compactWeeks);
      }
      lines.push(
        `• ${t.startTime}-${t.endTime}（${periodText}）${c.name}${
          meta.length ? ` · ${meta.join(" · ")}` : ""
        }`,
      );
    }
  }

  if (count === 0) {
    lines.push("", week != null ? `第 ${week} 周暂无课程安排` : "当前课表暂无课程安排");
  }

  lines.push("", "—— 导出自 Dark Study");
  return lines.join("\n");
}

/**
 * 全局课程搜索：支持多关键词（空格分隔），大小写不敏感匹配课程名、教师、教室与备注。
 * 查询为空时返回全部课程（按星期、节次、名称排序）。
 */
export function searchScheduleCourses(
  schedule: Schedule,
  query: string,
): Course[] {
  const cleaned = query.trim().toLowerCase();
  const baseCompare = (a: Course, b: Course) =>
    a.weekday - b.weekday ||
    a.startPeriod - b.startPeriod ||
    a.name.localeCompare(b.name);

  if (!cleaned) {
    return [...schedule.courses].sort(baseCompare);
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const scored: { course: Course; rank: number }[] = [];

  for (const course of schedule.courses) {
    const nameLower = course.name.toLowerCase();
    const teacherLower = (course.teacher ?? "").toLowerCase();
    const classroomLower = (course.classroom ?? "").toLowerCase();
    const noteLower = (course.note ?? "").toLowerCase();
    const combined = `${nameLower} ${teacherLower} ${classroomLower} ${noteLower}`;

    if (!tokens.every((token) => combined.includes(token))) {
      continue;
    }

    let rank = 3;
    if (nameLower === cleaned) rank = 0;
    else if (nameLower.startsWith(cleaned)) rank = 1;
    else if (tokens.every((token) => nameLower.includes(token))) rank = 2;

    scored.push({ course, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || baseCompare(a.course, b.course))
    .map((entry) => entry.course);
}

/** 统计整学期课表的门数、学分、总课时、各星期负荷及每周课次分布 */
export function computeScheduleStats(schedule: Schedule): ScheduleStats {
  const totalWeeks = resolveTotalWeeks(schedule);
  const sessionsPerWeek = Array.from({ length: totalWeeks }, () => 0);
  const semesterHoursByWeekday = [0, 0, 0, 0, 0, 0, 0];

  const uniqueCredits = new Map<string, number>();
  let totalSessions = 0;
  let totalClassHours = 0;
  let totalClockHours = 0;

  for (const course of schedule.courses) {
    const trimmedName = course.name.trim();
    if (trimmedName) {
      const key = `${trimmedName}|${(course.teacher ?? "").trim()}`;
      const creditVal =
        typeof course.credits === "number" &&
        Number.isFinite(course.credits) &&
        course.credits > 0
          ? course.credits
          : 0;
      const prev = uniqueCredits.get(key);
      if (prev === undefined || creditVal > prev) {
        uniqueCredits.set(key, creditVal);
      }
    }

    const validWeeks = [...new Set(course.weeks)].filter(
      (w) => Number.isInteger(w) && w >= 1 && w <= totalWeeks,
    );
    if (!validWeeks.length) continue;

    const periodCount = Math.max(1, course.endPeriod - course.startPeriod + 1);
    const time = getCourseTime(
      schedule.periods,
      course.startPeriod,
      course.endPeriod,
      course,
    );
    const sessionHours =
      time.durationMinutes > 0
        ? time.durationMinutes / 60
        : periodCount * 0.75;

    for (const w of validWeeks) {
      sessionsPerWeek[w - 1] += 1;
      totalSessions += 1;
      totalClassHours += periodCount;
      totalClockHours += sessionHours;
      if (course.weekday >= 1 && course.weekday <= 7) {
        semesterHoursByWeekday[course.weekday - 1] += sessionHours;
      }
    }
  }

  const weeklyHoursByWeekday = semesterHoursByWeekday.map((h) =>
    round2(h / totalWeeks),
  );

  let busiestWeekday: number | null = null;
  let maxDayHours = 0;
  for (let i = 0; i < 7; i++) {
    if (semesterHoursByWeekday[i] > maxDayHours) {
      maxDayHours = semesterHoursByWeekday[i];
      busiestWeekday = i + 1;
    }
  }

  let creditSum = 0;
  for (const credit of uniqueCredits.values()) {
    creditSum += credit;
  }

  return {
    uniqueCourseCount: uniqueCredits.size,
    slotCount: schedule.courses.length,
    totalCredits: round2(creditSum),
    totalSessions,
    totalClassHours,
    totalClockHours: round2(totalClockHours),
    weeklyHoursByWeekday,
    busiestWeekday,
    sessionsPerWeek,
  };
}

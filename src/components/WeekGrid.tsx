import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Period } from "@/types";
import {
  addDays,
  getCourseTime,
  isCourseActive,
  mondayOf,
  parseIsoDate,
  timeToMinutes,
} from "@/utils/time";

/** zoom=1 时所有星期列恰好铺满容器宽度（自适应屏幕，无需横向滚动） */
const AXIS_W_BASE = 42;
/** 真实时间比例模式下每分钟像素高度（基准） */
const PPM_BASE = 1.05;
/** 紧凑节次模式下每节课高度（基准） */
const COMPACT_SLOT_BASE = 54;
/** 紧凑节次模式下大课间（如午休/晚饭 ≥45 分钟）分隔条高度 */
const COMPACT_BREAK_BASE = 12;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 2.4;
/** 手指松开后的归位弹簧：接近临界阻尼，只回位不来回晃 */
const SLIDE_SPRING = { damping: 26, stiffness: 240, mass: 1 };
/** 翻页动画：纯缓动进入，观感利落 */
const SLIDE_IN = { duration: 200, easing: Easing.out(Easing.cubic) };

export interface WeekGridProps {
  courses: Course[];
  periods: Period[];
  /** 当前学期开学日 ISO（用于展示表头日期 M/D） */
  startDate: string;
  weekIndex: number;
  /** 总周数：左右滑动切换周数的边界 */
  weekCount: number;
  selectedWeekday: number;
  /** 真实本周周次（仅在学期中传入），用于高亮今天列与绘制当前时间线 */
  todayWeek?: number;
  todayWeekday?: number;
  now?: Date;
  /** 是否显示周六、周日（默认 true；false 时展示周一~周五 5 列） */
  showWeekend?: boolean;
  /** 是否以低透明虚线显示非本周课程（默认 false） */
  showOtherWeeks?: boolean;
  /** 是否按节次等高紧凑排布，折叠大段午休/晚休留白 */
  compact?: boolean;
  /** 冲突检测结果：courseId -> 与之冲突的课程名 */
  conflicts?: Map<string, string[]>;
  onPickDay: (weekday: number) => void;
  onPickCourse: (course: Course) => void;
  onLongPressCourse?: (course: Course) => void;
  /** 点空白格快速添加课程 */
  onPickEmptySlot?: (weekday: number, periodIndex: number) => void;
  /** 左右滑动切换周数 */
  onWeekChange: (week: number) => void;
}

/**
 * 现代课表周视图网格：
 * - 星期表头吸顶固定（含具体日期与今日列高亮），放大横向滚动时与网格 1:1 同步
 * - 支持「真实时间比例」与「节次等高紧凑排布」双模式
 * - 本周自动绘制当前时间红/蓝指示线与进行中课程高亮
 * - 两指捏合缩放（0.72x ~ 2.4x）+ 一键复位胶囊；zoom=1 左右滑切周
 * - 点空白格可直接带入星期与节次快速新建课程
 */
export const WeekGrid = React.memo(function WeekGrid({
  courses,
  periods,
  startDate,
  weekIndex,
  weekCount,
  selectedWeekday,
  todayWeek,
  todayWeekday,
  now,
  showWeekend = true,
  showOtherWeeks = false,
  compact = false,
  conflicts,
  onPickDay,
  onPickCourse,
  onLongPressCourse,
  onPickEmptySlot,
  onWeekChange,
}: WeekGridProps) {
  const winW = useWindowDimensions().width;
  const reducedMotion = useReducedMotion();
  const [baseW, setBaseW] = useState(winW - 16);
  const [zoom, setZoom] = useState(1);
  const [zooming, setZooming] = useState(false);

  const zoomSV = useSharedValue(1);
  const tx = useSharedValue(0);
  const prevWeekRef = React.useRef(weekIndex);

  const commitZoom = React.useCallback((total: number) => setZoom(total), []);
  const resetZoom = React.useCallback(() => {
    zoomSV.value = withTiming(
      1,
      { duration: reducedMotion ? 60 : 180, easing: Easing.out(Easing.cubic) },
      (fin) => {
        if (fin) runOnJS(commitZoom)(1);
      },
    );
  }, [commitZoom, reducedMotion, zoomSV]);

  React.useEffect(() => {
    if (prevWeekRef.current === weekIndex) return;
    const dir = weekIndex > prevWeekRef.current ? 1 : -1;
    prevWeekRef.current = weekIndex;
    if (reducedMotion) {
      tx.value = 0;
      return;
    }
    tx.value = dir * baseW;
    tx.value = withTiming(0, SLIDE_IN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIndex]);

  const dayCount = showWeekend ? 7 : 5;
  const visibleDays = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );
  const isCurrentWeek = todayWeek !== undefined && todayWeek === weekIndex;

  /** 本周每天的真实日期标签（M/D） */
  const weekDates = useMemo(() => {
    const monday = mondayOf(parseIsoDate(startDate));
    const weekStart = addDays(monday, (weekIndex - 1) * 7);
    return visibleDays.map((day) => {
      const d = addDays(weekStart, day - 1);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
  }, [startDate, weekIndex, visibleDays]);

  /* ---------------- 布局几何：支持真实比例 / 紧凑等高两种坐标系 ---------------- */
  const axisW = AXIS_W_BASE * zoom;
  const colW = ((baseW - AXIS_W_BASE) / dayCount) * zoom;
  const totalWidth = baseW * zoom;
  const ppm = PPM_BASE * zoom;
  const fs = (n: number) => n * zoom;

  const { periodLayout, gridHeight, yOfMinutes, dayStartMin, dayEndMin } = useMemo(() => {
    const startMin = timeToMinutes(periods[0]?.startTime ?? "08:00");
    const endMin = timeToMinutes(periods[periods.length - 1]?.endTime ?? "22:30");

    if (!compact || !periods.length) {
      const yFn = (mins: number) => (mins - startMin) * ppm;
      const layout = periods.map((p) => {
        const s = timeToMinutes(p.startTime);
        const e = timeToMinutes(p.endTime);
        const top = yFn(s);
        const height = Math.max(24 * zoom, yFn(e) - top);
        return { period: p, top, height, startMin: s, endMin: e, breakBefore: false };
      });
      const last = layout[layout.length - 1];
      const h = Math.max(yFn(endMin) + 4, last ? last.top + last.height + 4 : 200);
      return { periodLayout: layout, gridHeight: h, yOfMinutes: yFn, dayStartMin: startMin, dayEndMin: endMin };
    }

    // 紧凑模式：每节等高，大课间（≥45 分钟，如午休/晚饭）插入紧凑分隔带
    const slotH = COMPACT_SLOT_BASE * zoom;
    const breakH = COMPACT_BREAK_BASE * zoom;
    let cursor = 0;
    const layout = periods.map((p, i) => {
      const s = timeToMinutes(p.startTime);
      const e = timeToMinutes(p.endTime);
      const prevEnd = i > 0 ? timeToMinutes(periods[i - 1].endTime) : s;
      const breakBefore = i > 0 && s - prevEnd >= 45;
      if (breakBefore) cursor += breakH;
      const top = cursor;
      cursor += slotH;
      return { period: p, top, height: slotH, startMin: s, endMin: e, breakBefore };
    });

    // 把任意分钟数分段线性映射到紧凑坐标，保证精确时间与当前时间线也精准对齐
    const yFn = (mins: number): number => {
      if (!layout.length) return 0;
      if (mins <= layout[0].startMin) return layout[0].top;
      for (let i = 0; i < layout.length; i++) {
        const cur = layout[i];
        if (mins <= cur.endMin) {
          const span = Math.max(1, cur.endMin - cur.startMin);
          const ratio = Math.max(0, Math.min(1, (mins - cur.startMin) / span));
          return cur.top + ratio * cur.height;
        }
        const next = layout[i + 1];
        if (next && mins < next.startMin) {
          const gapSpan = Math.max(1, next.startMin - cur.endMin);
          const ratio = (mins - cur.endMin) / gapSpan;
          const curBottom = cur.top + cur.height;
          return curBottom + ratio * (next.top - curBottom);
        }
      }
      const last = layout[layout.length - 1];
      return last.top + last.height;
    };

    return {
      periodLayout: layout,
      gridHeight: cursor + 6,
      yOfMinutes: yFn,
      dayStartMin: startMin,
      dayEndMin: endMin,
    };
  }, [compact, periods, ppm, zoom]);

  const canSwipe = zoom <= 1.02;

  /* ---------------- 手势：两指缩放 + 单指切周 ---------------- */
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          runOnJS(setZooming)(true);
        })
        .onUpdate((e) => {
          const t = Math.min(Math.max(zoom * e.scale, MIN_ZOOM), MAX_ZOOM);
          zoomSV.value = t;
        })
        .onEnd((e, success) => {
          if (!success) {
            zoomSV.value = withTiming(zoom, { duration: 140 });
            return;
          }
          const t = Math.min(Math.max(zoom * e.scale, MIN_ZOOM), MAX_ZOOM);
          zoomSV.value = t;
          runOnJS(commitZoom)(t);
        })
        .onFinalize(() => {
          runOnJS(setZooming)(false);
        }),
    [zoom, zoomSV, commitZoom],
  );

  const weekPan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetX([-14, 14])
        .failOffsetY([-36, 36])
        .onUpdate((e) => {
          let t = e.translationX;
          if ((weekIndex <= 1 && t > 0) || (weekIndex >= weekCount && t < 0)) {
            t *= 0.25;
          }
          tx.value = t;
        })
        .onEnd((e, success) => {
          if (!success) {
            tx.value = withSpring(0, SLIDE_SPRING);
            return;
          }
          const fast = Math.abs(e.velocityX) > 500;
          const dir = fast
            ? e.velocityX < 0
              ? 1
              : -1
            : e.translationX < 0
              ? 1
              : -1;
          const next = weekIndex + dir;
          const go =
            (Math.abs(e.translationX) > 60 || fast) &&
            next >= 1 &&
            next <= weekCount;
          if (go) {
            if (reducedMotion) {
              tx.value = 0;
              runOnJS(onWeekChange)(next);
            } else {
              tx.value = withTiming(-dir * baseW, { duration: 170 }, (fin) => {
                if (fin) runOnJS(onWeekChange)(next);
              });
            }
          } else {
            tx.value = withSpring(0, SLIDE_SPRING);
          }
        }),
    [weekIndex, weekCount, baseW, tx, onWeekChange, reducedMotion],
  );

  const gesture = useMemo(
    () => (canSwipe ? Gesture.Simultaneous(pinch, weekPan) : pinch),
    [canSwipe, pinch, weekPan],
  );

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const previewStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomSV.value / zoom }],
  }));

  /* ---------------- 课程块几何：本周课程 + 可选非本周虚线课程 ---------------- */
  const { activeBlocks, ghostBlocks } = useMemo(() => {
    const curBlocks: {
      course: Course;
      top: number;
      height: number;
      lane: number;
      lanes: number;
    }[] = [];
    const otherBlocks: {
      course: Course;
      top: number;
      height: number;
    }[] = [];

    const visibleSet = courses.filter((c) => c.weeks.includes(weekIndex) && c.weekday <= dayCount);
    const otherSet = showOtherWeeks
      ? courses.filter((c) => !c.weeks.includes(weekIndex) && c.weekday <= dayCount)
      : [];

    for (const day of visibleDays) {
      const items = visibleSet
        .filter((c) => c.weekday === day)
        .map((course) => {
          const { startMinutes, endMinutes } = getCourseTime(
            periods,
            course.startPeriod,
            course.endPeriod,
            course,
          );
          const top = yOfMinutes(startMinutes) + 2 * zoom;
          const height = Math.max(
            24 * zoom,
            yOfMinutes(endMinutes) - yOfMinutes(startMinutes) - 4 * zoom,
          );
          return { course, top, height, bottom: top + height, lane: 0 };
        })
        .sort((a, b) => a.top - b.top || a.bottom - b.bottom);

      let cluster: typeof items = [];
      let clusterEnd = -Infinity;
      const flush = () => {
        if (!cluster.length) return;
        const lanes = Math.max(...cluster.map((i) => i.lane)) + 1;
        for (const item of cluster) curBlocks.push({ ...item, lanes });
        cluster = [];
      };
      for (const item of items) {
        if (cluster.length && item.top >= clusterEnd - 0.5) {
          flush();
          clusterEnd = -Infinity;
        }
        let lane = 0;
        while (
          cluster.some((i) => i.lane === lane && i.bottom > item.top + 0.5)
        ) {
          lane++;
        }
        item.lane = lane;
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.bottom);
      }
      flush();

      // 非本周课程仅在未与本周课程重叠的空槽展示，避免界面杂乱
      if (otherSet.length) {
        const dayOthers = otherSet.filter((c) => c.weekday === day);
        const occupied = items.map((it) => [it.top, it.bottom] as const);
        for (const course of dayOthers) {
          const { startMinutes, endMinutes } = getCourseTime(
            periods,
            course.startPeriod,
            course.endPeriod,
            course,
          );
          const top = yOfMinutes(startMinutes) + 2 * zoom;
          const height = Math.max(
            24 * zoom,
            yOfMinutes(endMinutes) - yOfMinutes(startMinutes) - 4 * zoom,
          );
          const bottom = top + height;
          const overlapsCurrent = occupied.some(
            ([ot, ob]) => top < ob - 2 && bottom > ot + 2,
          );
          if (!overlapsCurrent) {
            otherBlocks.push({ course, top, height });
            occupied.push([top, bottom]);
          }
        }
      }
    }
    return { activeBlocks: curBlocks, ghostBlocks: otherBlocks };
  }, [courses, dayCount, periods, showOtherWeeks, visibleDays, weekIndex, yOfMinutes, zoom]);

  /* ---------------- 当前时间指示线坐标 ---------------- */
  const nowLineY = useMemo(() => {
    if (!isCurrentWeek || !now) return null;
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < dayStartMin || mins > dayEndMin) return null;
    return yOfMinutes(mins);
  }, [dayEndMin, dayStartMin, isCurrentWeek, now, yOfMinutes]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[{ flex: 1 }, slideStyle]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - baseW) > 1) setBaseW(w);
        }}
      >
        {/* 外层横向滚动包住「吸顶表头 + 纵向网格」：放大横滑时表头与列严格同步，纵滑时表头始终吸顶 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!canSwipe && !zooming}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                { width: totalWidth, flex: 1, transformOrigin: "left top" },
                previewStyle,
              ]}
            >
              {/* ---------- 吸顶星期表头（含日期 + 今日高亮） ---------- */}
              <View
                style={{ flexDirection: "row", paddingBottom: 4 * zoom }}
                className="border-b border-slate-200/70 dark:border-white/[0.08]"
              >
                <View style={{ width: axisW, alignItems: "flex-end", justifyContent: "center", paddingRight: 6 * zoom }}>
                  <Text
                    style={{ fontSize: fs(9), fontWeight: "700" }}
                    className="text-slate-400 dark:text-slate-500"
                  >
                    节次
                  </Text>
                </View>
                {visibleDays.map((day, idx) => {
                  const isTodayCol = isCurrentWeek && todayWeekday === day;
                  const isSel = day === selectedWeekday;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => onPickDay(day)}
                      style={{
                        width: colW,
                        paddingVertical: 4 * zoom,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 6 * zoom,
                          paddingVertical: 2 * zoom,
                          borderRadius: 10 * zoom,
                        }}
                        className={
                          isTodayCol
                            ? "bg-sky-500/85"
                            : isSel
                              ? "bg-sky-400/18"
                              : ""
                        }
                      >
                        <Text
                          style={{
                            fontSize: fs(10.5),
                            fontWeight: "700",
                            textAlign: "center",
                          }}
                          className={
                            isTodayCol
                              ? "text-white"
                              : isSel
                                ? "text-sky-600 dark:text-sky-300"
                                : "text-slate-600 dark:text-slate-300"
                          }
                        >
                          {WEEKDAY_LABELS[day - 1]}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs(8),
                            textAlign: "center",
                            marginTop: 1,
                          }}
                          className={
                            isTodayCol
                              ? "text-white/90"
                              : "text-slate-400 dark:text-slate-500"
                          }
                        >
                          {weekDates[idx]}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* ---------- 纵向可滚动课程网格 ---------- */}
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                scrollEnabled={!zooming}
                contentContainerStyle={{ paddingBottom: 110 }}
              >
                <View style={{ height: gridHeight }}>
                  {/* 今日整列极淡底色提示 */}
                  {isCurrentWeek && todayWeekday && todayWeekday <= dayCount ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: axisW + (todayWeekday - 1) * colW,
                        width: colW,
                      }}
                      className="bg-sky-400/[0.06] dark:bg-sky-400/[0.07]"
                    />
                  ) : null}

                  {/* 背景网格线 + 左侧时间轴 + 可点击空白格 */}
                  {periodLayout.map(({ period: p, top, height, breakBefore }) => (
                    <React.Fragment key={p.index}>
                      {breakBefore ? (
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            top: top - COMPACT_BREAK_BASE * zoom,
                            left: axisW,
                            right: 0,
                            height: COMPACT_BREAK_BASE * zoom,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <View className="h-px w-[92%] bg-slate-300/45 dark:bg-white/[0.08]" />
                        </View>
                      ) : null}
                      <View
                        style={{
                          position: "absolute",
                          top,
                          left: 0,
                          right: 0,
                          height,
                          flexDirection: "row",
                        }}
                      >
                        <View
                          pointerEvents="none"
                          style={{
                            width: axisW,
                            paddingRight: 6 * zoom,
                            alignItems: "flex-end",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{ fontSize: fs(10), fontWeight: "700" }}
                            className="text-slate-600 dark:text-slate-300"
                          >
                            {p.index}
                          </Text>
                          <Text
                            style={{ fontSize: fs(7.8) }}
                            className="text-slate-400 dark:text-slate-500"
                          >
                            {p.startTime}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: dayCount * colW,
                            height: "100%",
                            flexDirection: "row",
                          }}
                          className="border-b border-slate-200/70 dark:border-white/[0.06]"
                        >
                          {visibleDays.map((day) => (
                            <Pressable
                              key={day}
                              onPress={onPickEmptySlot ? () => onPickEmptySlot(day, p.index) : undefined}
                              style={{ width: colW, height: "100%" }}
                              className="border-r border-slate-200/70 active:bg-sky-400/12 dark:border-white/[0.06]"
                            />
                          ))}
                        </View>
                      </View>
                    </React.Fragment>
                  ))}

                  {/* 非本周课程（虚线淡显，便于排课避重） */}
                  {ghostBlocks.map(({ course, top, height }) => {
                    const palette = coursePalette[course.color] ?? coursePalette.sky;
                    return (
                      <Pressable
                        key={`ghost-${course.id}`}
                        onPress={() => onPickCourse(course)}
                        style={{
                          position: "absolute",
                          top,
                          left: axisW + (course.weekday - 1) * colW + 2.5 * zoom,
                          width: Math.max(12, colW - 5 * zoom),
                          height,
                          borderRadius: 11 * Math.min(zoom, 1.5),
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: `${palette.solid}88`,
                          backgroundColor: `${palette.solid}14`,
                          opacity: 0.48,
                          paddingHorizontal: 3.5 * zoom,
                          paddingVertical: 2.5 * zoom,
                          overflow: "hidden",
                        }}
                      >
                        <Text
                          numberOfLines={2}
                          style={{ fontSize: fs(8.5), fontWeight: "600", includeFontPadding: false }}
                          className="text-slate-600 dark:text-slate-300"
                        >
                          [非本周] {course.name}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* 本周课程块（按实际时间跨度定位；重叠课程等宽并排） */}
                  {activeBlocks.map(({ course, top, height, lane, lanes }) => {
                    const palette = coursePalette[course.color] ?? coursePalette.sky;
                    const isConflict = conflicts?.has(course.id) ?? false;
                    const isLive =
                      isCurrentWeek &&
                      todayWeekday === course.weekday &&
                      !!now &&
                      isCourseActive(course, periods, weekIndex, course.weekday, now);
                    const laneW = colW / lanes;
                    const narrow = lanes > 1;

                    const padY = 3 * zoom;
                    const contentH = Math.max(0, height - padY * 2);
                    const nameSize = fs(narrow ? 8.5 : showWeekend ? 10 : 11);
                    const nameLineH = nameSize * 1.32;
                    const metaLineH = fs(8) * 1.34;
                    const teacherLineH = fs(7.5) * 1.34;

                    const hasTeacher = !!course.teacher;
                    const showTeacher = hasTeacher && contentH >= 70 * zoom;
                    const showRoom = !!course.classroom && contentH >= 36 * zoom;
                    const roomLines = contentH >= 60 * zoom ? 2 : 1;

                    const metaH =
                      (isConflict ? fs(7.5) * 1.35 + 2 * zoom : 0) +
                      (showRoom ? roomLines * metaLineH + 2 * zoom : 0) +
                      (showTeacher ? teacherLineH + 1 * zoom : 0);
                    const nameLines = Math.max(
                      1,
                      Math.min(7, Math.floor((contentH - metaH) / nameLineH)),
                    );

                    return (
                      <Pressable
                        key={course.id}
                        onPress={() => onPickCourse(course)}
                        onLongPress={onLongPressCourse ? () => onLongPressCourse(course) : undefined}
                        delayLongPress={360}
                        style={{
                          position: "absolute",
                          top,
                          left:
                            axisW +
                            (course.weekday - 1) * colW +
                            lane * laneW +
                            2 * zoom,
                          width: Math.max(12, laneW - 4 * zoom),
                          height,
                          borderRadius: 12 * Math.min(zoom, 1.5),
                          overflow: "hidden",
                          backgroundColor: isLive ? `${palette.solid}CC` : `${palette.solid}3D`,
                          borderLeftWidth: 2.8 * Math.min(zoom, 1.5),
                          borderLeftColor: isLive ? "#FFFFFF" : palette.solid,
                          paddingHorizontal: (narrow ? 2.5 : 4.5) * zoom,
                          paddingVertical: padY,
                          borderWidth: isConflict ? 1.2 : isLive ? 1 : 0,
                          borderColor: isConflict ? "#F59E0B" : "#FFFFFF",
                        }}
                      >
                        <Text
                          numberOfLines={nameLines}
                          style={{
                            fontSize: nameSize,
                            fontWeight: "700",
                            includeFontPadding: false,
                            color: isLive ? "#FFFFFF" : undefined,
                          }}
                          className={isLive ? "" : "text-slate-800 dark:text-slate-100"}
                        >
                          {course.name}
                        </Text>
                        {isConflict ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: fs(7.5),
                              fontWeight: "700",
                              marginTop: 2 * zoom,
                            }}
                            className={
                              isLive
                                ? "text-amber-100"
                                : "text-amber-600 dark:text-amber-400"
                            }
                          >
                            {narrow ? "⚠" : "⚠ 冲突"}
                          </Text>
                        ) : null}
                        {showRoom ? (
                          <Text
                            numberOfLines={roomLines}
                            style={{
                              fontSize: fs(8),
                              marginTop: 2 * zoom,
                              color: isLive ? "rgba(255,255,255,0.92)" : undefined,
                            }}
                            className={isLive ? "" : "text-slate-600 dark:text-slate-300"}
                          >
                            {course.classroom}
                          </Text>
                        ) : null}
                        {showTeacher ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: fs(7.5),
                              marginTop: 1 * zoom,
                              color: isLive ? "rgba(255,255,255,0.8)" : undefined,
                            }}
                            className={isLive ? "" : "text-slate-500 dark:text-slate-400"}
                          >
                            {course.teacher}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}

                  {/* 当前时间指示线（仅本周且当前在作息时间范围内显示） */}
                  {nowLineY !== null ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: nowLineY - 3,
                        left: axisW - 3,
                        right: 0,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 3.5,
                          backgroundColor: "#38BDF8",
                        }}
                      />
                      <View
                        style={{
                          flex: 1,
                          height: 1.5,
                          backgroundColor: "#38BDF8",
                          opacity: 0.85,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </ScrollView>
      </Animated.View>

      {/* 缩放偏离 100% 时显示快捷复位胶囊，避免不知为何左右切周暂停 */}
      {Math.abs(zoom - 1) > 0.04 ? (
        <Pressable
          onPress={resetZoom}
          accessibilityRole="button"
          accessibilityLabel="恢复默认缩放"
          className="absolute right-3 top-12 rounded-full border border-sky-400/40 bg-slate-900/75 px-3 py-1.5"
        >
          <Text className="text-[11px] font-bold text-sky-300">
            {Math.round(zoom * 100)}% · 重置
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

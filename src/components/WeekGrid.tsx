import React, { useState } from "react";
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
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability --
   Reanimated shared value（zoomSV/tx）本质是跨渲染、跨线程可变的容器，
   手势 worklet 与 effect 对其赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Period } from "@/types";
import { getCourseTime, timeToMinutes } from "@/utils/time";

/** zoom=1 时 7 列恰好铺满容器宽度（自适应屏幕，无需横向滚动） */
const AXIS_W_BASE = 42;
/** 每分钟像素高度（基准）：把真实时间线性映射到网格，保证时间轴与课程块对齐 */
const PPM_BASE = 1.05;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.6;
/** 手指松开后的归位弹簧：接近临界阻尼，只回位不来回晃 */
const SLIDE_SPRING = { damping: 26, stiffness: 240, mass: 1 };
/** 翻页动画：纯缓动进入，没有回弹，观感更自然 */
const SLIDE_IN = { duration: 210, easing: Easing.out(Easing.cubic) };

export interface WeekGridProps {
  courses: Course[];
  periods: Period[];
  weekIndex: number;
  /** 总周数：左右滑动切换周数的边界 */
  weekCount: number;
  selectedWeekday: number;
  /** 冲突检测结果：courseId -> 与之冲突的课程名 */
  conflicts?: Map<string, string[]>;
  onPickDay: (weekday: number) => void;
  onPickCourse: (course: Course) => void;
  /** 左右滑动切换周数 */
  onWeekChange: (week: number) => void;
}

/**
 * 经典课表网格：左侧时间轴 + 7 个星期列。
 * - 行高按真实时间比例（含课间），保证左侧时间标签与课程块竖向对齐
 * - 两指捏合缩放（0.7x ~ 2.6x），缩放期间预览用 transform，提交后无缝切换到真实布局
 * - zoom=1 时恰好铺满屏幕；左右滑动切换周数（放大后改为横向平移浏览）
 * - 同一时段有多门课时并排显示，避免其中一门被另一门完全盖住
 */
export function WeekGrid({
  courses,
  periods,
  weekIndex,
  weekCount,
  selectedWeekday,
  conflicts,
  onPickDay,
  onPickCourse,
  onWeekChange,
}: WeekGridProps) {
  const winW = useWindowDimensions().width;
  /** 容器实测宽度：所有列宽由它推导，旋转/分屏自适应 */
  const [baseW, setBaseW] = useState(winW - 24);
  const [zoom, setZoom] = useState(1);
  /** 捏合进行中：临时禁用内层滚动，避免与缩放手势打架 */
  const [zooming, setZooming] = useState(false);

  // 捏合预览缩放（总倍率）。布局倍率为 zoom，transform 取两者之比，
  // 提交后比值归 1、真实布局无缝接替，全程无闪烁
  const zoomSV = useSharedValue(1);
  // 周切换横向位移
  const tx = useSharedValue(0);
  const prevWeekRef = React.useRef(weekIndex);

  const commitZoom = React.useCallback((total: number) => setZoom(total), []);

  // 周数变化（滑动/周次 pills）后新内容从对应侧滑入
  React.useEffect(() => {
    if (prevWeekRef.current === weekIndex) return;
    const dir = weekIndex > prevWeekRef.current ? 1 : -1;
    prevWeekRef.current = weekIndex;
    tx.value = dir * baseW;
    tx.value = withTiming(0, SLIDE_IN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIndex]);

  /* ---------------- 布局几何：全部随 zoom 线性缩放 ---------------- */
  const axisW = AXIS_W_BASE * zoom;
  const colW = ((baseW - AXIS_W_BASE) / 7) * zoom;
  const totalWidth = baseW * zoom;
  const ppm = PPM_BASE * zoom;
  const fs = (n: number) => n * zoom;

  // 真实时间 -> y 坐标
  const dayStart = timeToMinutes(periods[0]?.startTime ?? "08:00");
  const yOf = (time: string) => (timeToMinutes(time) - dayStart) * ppm;
  const gridHeight = yOf(periods[periods.length - 1]?.endTime ?? "22:30") + 4;

  // 当前周次下生效的课程
  const visible = courses.filter((c) => c.weeks.includes(weekIndex));

  /** 放大到 1.02x 以上时横向平移交给滚动，关闭周切换滑动 */
  const canSwipe = zoom <= 1.02;

  /* ---------------- 手势：两指缩放 + 单指切换周数 ---------------- */
  const pinch = React.useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          runOnJS(setZooming)(true);
        })
        .onUpdate((e) => {
          const t = Math.min(Math.max(zoom * e.scale, MIN_ZOOM), MAX_ZOOM);
          zoomSV.value = t;
        })
        .onEnd((e) => {
          const t = Math.min(Math.max(zoom * e.scale, MIN_ZOOM), MAX_ZOOM);
          zoomSV.value = t;
          runOnJS(commitZoom)(t);
        })
        .onFinalize(() => {
          runOnJS(setZooming)(false);
        }),
    [zoom, zoomSV, commitZoom],
  );

  const weekPan = React.useMemo(
    () =>
      Gesture.Pan()
        // 只响应单指，避免与两指缩放冲突
        .maxPointers(1)
        // 横向明显移动才激活，纵向滚动交还给列表；
        // failOffsetY 留足余量，手指略带上下偏移时也能成功切换周
        .activeOffsetX([-14, 14])
        .failOffsetY([-36, 36])
        .onUpdate((e) => {
          let t = e.translationX;
          // 边界阻尼：首周继续右滑 / 末周继续左滑产生阻力
          if ((weekIndex <= 1 && t > 0) || (weekIndex >= weekCount && t < 0)) {
            t *= 0.25;
          }
          tx.value = t;
        })
        .onEnd((e) => {
          const dir = e.translationX < 0 ? 1 : -1;
          const next = weekIndex + dir;
          const go =
            (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 500) &&
            next >= 1 &&
            next <= weekCount;
          if (go) {
            // 旧内容滑出后切换周数，effect 再把新内容滑入（缓动，无回弹）
            tx.value = withTiming(-dir * baseW, { duration: 180 }, (fin) => {
              if (fin) runOnJS(onWeekChange)(next);
            });
          } else {
            tx.value = withSpring(0, SLIDE_SPRING);
          }
        }),
    [weekIndex, weekCount, baseW, tx, onWeekChange],
  );

  const gesture = React.useMemo(
    () => (canSwipe ? Gesture.Simultaneous(pinch, weekPan) : pinch),
    [canSwipe, pinch, weekPan],
  );

  // 周切换位移（整体滑动）
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  // 捏合预览缩放：以左上角为原点，与真实布局（向右下增长）完全对齐
  const previewStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomSV.value / zoom }],
  }));

  /* ---------------- 课程块几何：同列重叠课程并排，避免互相遮挡 ---------------- */
  const blocks: {
    course: Course;
    top: number;
    height: number;
    lane: number;
    lanes: number;
  }[] = [];

  for (let day = 1; day <= 7; day++) {
    const items = visible
      .filter((c) => c.weekday === day)
      .map((course) => {
        const { startTime, endTime } = getCourseTime(
          periods,
          course.startPeriod,
          course.endPeriod,
        );
        const top = yOf(startTime) + 2 * zoom;
        const height = Math.max(
          22 * zoom,
          yOf(endTime) - yOf(startTime) - 5 * zoom,
        );
        return { course, top, height, bottom: top + height, lane: 0 };
      })
      .sort((a, b) => a.top - b.top || a.bottom - b.bottom);

    // 重叠簇内按「车道」贪心分配：同车道的课程互不重叠，簇内课程等宽并排
    let cluster: typeof items = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      if (!cluster.length) return;
      const lanes = Math.max(...cluster.map((i) => i.lane)) + 1;
      for (const item of cluster) blocks.push({ ...item, lanes });
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
  }

  return (
    /* 手势挂在实际内容上（ScrollView 内部），Android 上滚动容器才不会再抢走横向手势 */
    <Animated.View
      style={[{ flex: 1 }, slideStyle]}
      onLayout={(e) => setBaseW(e.nativeEvent.layout.width)}
    >
      {/* 外层纵向滚动：网格整体高度超出屏幕时可以上下滚动，
          底部留出悬浮 Action Bar 的高度，避免最后几节课被遮挡 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEnabled={!zooming}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!canSwipe && !zooming}
        >
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                { width: totalWidth, transformOrigin: "left top" },
                previewStyle,
              ]}
            >
              {/* 星期表头 */}
              <View style={{ flexDirection: "row" }}>
                <View style={{ width: axisW }} />
                {WEEKDAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const isSel = day === selectedWeekday;
                  return (
                    <Text
                      key={label}
                      onPress={() => onPickDay(day)}
                      style={{
                        width: colW,
                        paddingVertical: 7 * zoom,
                        fontSize: fs(11),
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                      className={
                        isSel
                          ? "text-sky-500 dark:text-sky-300"
                          : "text-slate-500 dark:text-slate-400"
                      }
                    >
                      {label}
                    </Text>
                  );
                })}
              </View>

              <View style={{ height: gridHeight }}>
                {/* 背景网格线 + 时间轴（按真实时间定位，与课程块对齐） */}
                {periods.map((p) => (
                  <View
                    key={p.index}
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: yOf(p.startTime),
                      left: 0,
                      right: 0,
                      height: Math.max(0, yOf(p.endTime) - yOf(p.startTime)),
                      flexDirection: "row",
                    }}
                  >
                    <View
                      style={{
                        width: axisW,
                        paddingRight: 6 * zoom,
                        alignItems: "flex-end",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{ fontSize: fs(10), fontWeight: "700" }}
                        className="text-slate-500 dark:text-slate-400"
                      >
                        {p.index}
                      </Text>
                      <Text
                        style={{ fontSize: fs(8) }}
                        className="text-slate-400 dark:text-slate-500"
                      >
                        {p.startTime}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 7 * colW,
                        height: "100%",
                        marginTop: 1,
                        flexDirection: "row",
                      }}
                      className="border-b border-slate-200/70 dark:border-white/[0.06]"
                    >
                      {WEEKDAY_LABELS.map((wd) => (
                        <View
                          key={wd}
                          style={{ width: colW }}
                          className="border-r border-slate-200/70 dark:border-white/[0.06]"
                        />
                      ))}
                    </View>
                  </View>
                ))}

                {/* 课程块（按真实时间跨度定位；重叠课程等宽并排） */}
                {blocks.map(({ course, top, height, lane, lanes }) => {
                  const palette = coursePalette[course.color];
                  const isConflict = conflicts?.has(course.id) ?? false;
                  const laneW = colW / lanes;
                  // 并排显示时列更窄：缩小字号与内边距，保证两门课都能看清并点开
                  const narrow = lanes > 1;

                  /* ---- 内容分级排版：先保证课程名完整，再依次补教室、教师 ---- */
                  const padY = 3 * zoom;
                  const contentH = Math.max(0, height - padY * 2);
                  const nameSize = fs(narrow ? 8.5 : 10);
                  const nameLineH = nameSize * 1.34;
                  const metaLineH = fs(8) * 1.36;
                  const teacherLineH = fs(7.5) * 1.36;

                  const hasTeacher = !!course.teacher;
                  // 高度优先给课程名：教室 1 行起步，教师只在两节及以上的块里出现
                  const showTeacher = hasTeacher && contentH >= 72 * zoom;
                  const showRoom = !!course.classroom && contentH >= 38 * zoom;
                  const roomLines = contentH >= 62 * zoom ? 2 : 1;

                  // 课程名可用高度 = 总内容高 - 教室/教师预留
                  const metaH =
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
                      style={{
                        position: "absolute",
                        top,
                        left:
                          axisW +
                          (course.weekday - 1) * colW +
                          lane * laneW +
                          2.5 * zoom,
                        width: Math.max(12, laneW - 5 * zoom),
                        height,
                        borderRadius: 12 * Math.min(zoom, 1.5),
                        overflow: "hidden",
                        backgroundColor: palette.solid + "3D",
                        borderLeftWidth: 2.5 * Math.min(zoom, 1.5),
                        borderLeftColor: palette.solid,
                        paddingHorizontal: (narrow ? 2.5 : 4) * zoom,
                        paddingVertical: padY,
                        // 冲突课程：琥珀色描边 + 警示角标
                        borderWidth: isConflict ? 1 : 0,
                        borderColor: "#F59E0B",
                      }}
                    >
                      <Text
                        numberOfLines={nameLines}
                        style={{
                          fontSize: nameSize,
                          fontWeight: "700",
                          includeFontPadding: false,
                        }}
                        className="text-slate-800 dark:text-slate-100"
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
                          className="text-amber-500"
                        >
                          {narrow ? "⚠" : "⚠ 冲突"}
                        </Text>
                      ) : null}
                      {showRoom ? (
                        <Text
                          numberOfLines={roomLines}
                          style={{ fontSize: fs(8), marginTop: 2 * zoom }}
                          className="text-slate-600 dark:text-slate-300"
                        >
                          {course.classroom}
                        </Text>
                      ) : null}
                      {showTeacher ? (
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: fs(7.5), marginTop: 1 * zoom }}
                          className="text-slate-500 dark:text-slate-400"
                        >
                          {course.teacher}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </GestureDetector>
        </ScrollView>
      </ScrollView>
    </Animated.View>
  );
}

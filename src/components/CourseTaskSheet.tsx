import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { ensureReminderPermission } from "@/services/courseReminders";
import { useStore } from "@/store/useStore";
import type { Course, Schedule } from "@/types";
import {
  EXAM_MODES,
  TASK_REMINDERS,
  TASK_TYPES,
  formatTaskCountdown,
  type CourseExamMode,
  type CourseTask,
  type CourseTaskDraft,
  type CourseTaskLink,
  type CourseTaskType,
  type TaskReminder,
} from "@/utils/courseTasks";
import { selectHaptic } from "@/utils/haptics";
import {
  buildExamTimeline,
  type ExamTicketItem,
} from "@/utils/studyProgress";

export interface CourseTaskSheetProps {
  visible: boolean;
  schedule: Schedule;
  /** 可选：从某门课程快捷入口打开时预填关联课程 */
  initialCourse?: Course | null;
  /** 可选：打开时直接进入新建任务表单 */
  initialCreate?: boolean;
  onClose: () => void;
}

type FilterType = "all" | "examWeek" | CourseTaskType;

const REMINDER_LABELS: Record<TaskReminder, string> = {
  0: "不提醒",
  15: "提前 15 分钟",
  60: "提前 1 小时",
  1440: "提前 1 天",
};

const TYPE_STYLE: Record<
  CourseTaskType,
  { badge: string; text: string; active: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  homework: {
    badge: "border-sky-400/35 bg-sky-500/12 dark:bg-sky-400/15",
    text: "text-sky-700 dark:text-sky-300",
    active: "border-sky-400/75 bg-sky-500/20",
    icon: "document-text-outline",
  },
  exam: {
    badge: "border-rose-400/40 bg-rose-500/12 dark:bg-rose-400/15",
    text: "text-rose-700 dark:text-rose-300",
    active: "border-rose-400/75 bg-rose-500/20",
    icon: "school-outline",
  },
  review: {
    badge: "border-violet-400/40 bg-violet-500/12 dark:bg-violet-400/15",
    text: "text-violet-700 dark:text-violet-300",
    active: "border-violet-400/75 bg-violet-500/20",
    icon: "book-outline",
  },
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatClockHm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatDueDisplay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatClockHm(d)}`;
}

function defaultDueAt(daysAhead = 1, hour = 21, minute = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

function parseYmdHm(ymd: string, hm: string): number | null {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ymd.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!dm || !tm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

export function CourseTaskSheet(props: CourseTaskSheetProps) {
  if (!props.visible) return null;
  return <CourseTaskSheetBody {...props} />;
}

function CourseTaskSheetBody({
  schedule,
  initialCourse,
  initialCreate = false,
  onClose,
}: CourseTaskSheetProps) {
  const courseTasks = useStore((s) => s.courseTasks);
  const addCourseTask = useStore((s) => s.addCourseTask);
  const updateCourseTask = useStore((s) => s.updateCourseTask);
  const toggleCourseTask = useStore((s) => s.toggleCourseTask);
  const removeCourseTask = useStore((s) => s.removeCourseTask);
  const clearCompletedCourseTasks = useStore((s) => s.clearCompletedCourseTasks);

  const now = useForegroundClock();
  const nowMs = now.getTime();
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [kbH, setKbH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbH(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const sheetH = Math.max(
    360,
    Math.min(Math.round(winH * 0.86), winH - kbH - 16),
  );
  const bottomSafePad = kbH > 0 ? 16 : Math.max(insets.bottom, 16) + 12;

  const distinctCourses = useMemo(() => {
    const seen = new Set<string>();
    const list: Course[] = [];
    for (const c of schedule.courses) {
      const key = c.name.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(c);
    }
    return list;
  }, [schedule.courses]);

  const [filter, setFilter] = useState<FilterType>("all");
  const [showCompleted, setShowCompleted] = useState(true);

  const [viewMode, setViewMode] = useState<"list" | "form">(
    initialCreate || initialCourse ? "form" : "list",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<CourseTaskType>("homework");
  const [dueAt, setDueAt] = useState<number>(() => defaultDueAt(1, 22, 0));
  const [dateInput, setDateInput] = useState(() => formatDateYmd(new Date(defaultDueAt(1, 22, 0))));
  const [timeInput, setTimeInput] = useState(() => formatClockHm(new Date(defaultDueAt(1, 22, 0))));
  const [reminder, setReminder] = useState<TaskReminder>(60);
  const [linkedCourse, setLinkedCourse] = useState<CourseTaskLink | undefined>(() =>
    initialCourse
      ? {
          scheduleId: schedule.id,
          courseId: initialCourse.id,
          courseName: initialCourse.name,
        }
      : undefined,
  );
  const [location, setLocation] = useState("");
  const [seat, setSeat] = useState("");
  const [examMode, setExamMode] = useState<CourseExamMode | undefined>(undefined);
  const [note, setNote] = useState("");
  const [iosPicker, setIosPicker] = useState<"date" | "time" | null>(null);

  const applyDueTimestamp = (ms: number) => {
    const d = new Date(ms);
    setDueAt(ms);
    setDateInput(formatDateYmd(d));
    setTimeInput(formatClockHm(d));
  };

  const openCreateForm = (
    presetCourse?: Course | null,
    presetType: CourseTaskType = "homework",
  ) => {
    selectHaptic();
    const initialMs =
      presetType === "exam" ? defaultDueAt(3, 9, 0) : defaultDueAt(1, 22, 0);
    setEditingId(null);
    setTitle("");
    setTaskType(presetType);
    applyDueTimestamp(initialMs);
    setReminder(presetType === "exam" ? 1440 : 60);
    setLinkedCourse(
      presetCourse
        ? {
            scheduleId: schedule.id,
            courseId: presetCourse.id,
            courseName: presetCourse.name,
          }
        : undefined,
    );
    setLocation("");
    setSeat("");
    setExamMode(undefined);
    setNote("");
    setIosPicker(null);
    setViewMode("form");
  };

  const openEditForm = (task: CourseTask) => {
    selectHaptic();
    setEditingId(task.id);
    setTitle(task.title);
    setTaskType(task.type);
    applyDueTimestamp(task.dueAt);
    setReminder(task.reminder);
    setLinkedCourse(task.course);
    setLocation(task.location ?? "");
    setSeat(task.seat ?? "");
    setExamMode(task.examMode);
    setNote(task.note ?? "");
    setIosPicker(null);
    setViewMode("form");
  };

  const applyQuickPreset = (daysAhead: number, hour: number, minute: number) => {
    selectHaptic();
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, minute, 0, 0);
    applyDueTimestamp(d.getTime());
    setIosPicker(null);
  };

  const openNativePicker = (pickerMode: "date" | "time") => {
    const current = new Date(dueAt);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: pickerMode,
        is24Hour: true,
        onValueChange: (_event, selected) => {
          if (!selected) return;
          const merged = new Date(dueAt);
          if (pickerMode === "date") {
            merged.setFullYear(
              selected.getFullYear(),
              selected.getMonth(),
              selected.getDate(),
            );
          } else {
            merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          }
          applyDueTimestamp(merged.getTime());
        },
      });
    } else if (Platform.OS === "ios") {
      setIosPicker((prev) => (prev === pickerMode ? null : pickerMode));
    }
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("请填写任务名称", "例如「高数期末考试」或「线代第3章作业」。");
      return;
    }
    let finalDueAt = dueAt;
    if (Platform.OS === "web") {
      const parsed = parseYmdHm(dateInput, timeInput);
      if (!parsed) {
        Alert.alert("日期或时间格式无效", "请使用 YYYY-MM-DD 和 HH:mm 格式。");
        return;
      }
      finalDueAt = parsed;
    }
    const draft: CourseTaskDraft = {
      title: trimmedTitle.slice(0, 120),
      type: taskType,
      dueAt: finalDueAt,
      reminder,
      course: linkedCourse,
      location: taskType === "exam" ? location.trim().slice(0, 80) || undefined : undefined,
      seat: taskType === "exam" ? seat.trim().slice(0, 32) || undefined : undefined,
      examMode: taskType === "exam" ? examMode : undefined,
      note: note.trim().slice(0, 200) || undefined,
    };
    try {
      if (editingId) {
        updateCourseTask(editingId, draft);
      } else {
        addCourseTask(draft);
      }
      if (reminder > 0) {
        void ensureReminderPermission().catch(() => {});
      }
      selectHaptic();
      setViewMode("list");
      setEditingId(null);
    } catch (error) {
      Alert.alert(
        "保存失败",
        error instanceof Error ? error.message : "请检查填写内容后重试",
      );
    }
  };

  const confirmDeleteTask = (task: CourseTask) => {
    if (Platform.OS === "web") {
      removeCourseTask(task.id);
      if (editingId === task.id) {
        setEditingId(null);
        setViewMode("list");
      }
      return;
    }
    Alert.alert("删除待办", `确定删除「${task.title}」吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          removeCourseTask(task.id);
          if (editingId === task.id) {
            setEditingId(null);
            setViewMode("list");
          }
        },
      },
    ]);
  };

  const examTimeline = useMemo(
    () => buildExamTimeline(courseTasks, nowMs),
    [courseTasks, nowMs],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    const byType: Record<FilterType, number> = {
      all: 0,
      examWeek: examTimeline.length,
      homework: 0,
      exam: 0,
      review: 0,
    };
    for (const t of courseTasks) {
      if (t.completedAt) {
        completed += 1;
      } else {
        pending += 1;
        byType.all += 1;
        byType[t.type] += 1;
      }
    }
    return { pending, completed, byType };
  }, [courseTasks, examTimeline.length]);

  const { pendingList, completedList } = useMemo(() => {
    const filtered =
      filter === "all"
        ? courseTasks
        : filter === "examWeek"
          ? courseTasks.filter((t) => t.type === "exam")
          : courseTasks.filter((t) => t.type === filter);
    const pendingItems = filtered
      .filter((t) => !t.completedAt)
      .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
    const completedItems = filtered
      .filter((t) => Boolean(t.completedAt))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { pendingList: pendingItems, completedList: completedItems };
  }, [courseTasks, filter]);

  const handleClose = () => {
    if (viewMode === "form" && !initialCreate && !initialCourse) {
      setViewMode("list");
      setEditingId(null);
      return;
    }
    onClose();
  };

  const renderTaskRow = (task: CourseTask) => {
    const done = Boolean(task.completedAt);
    const countdown = formatTaskCountdown(task.dueAt, nowMs);
    const typeStyle = TYPE_STYLE[task.type];
    const countdownBadgeClass = done
      ? "border-emerald-400/35 bg-emerald-500/12"
      : countdown.overdue
        ? "border-rose-500/45 bg-rose-500/18"
        : countdown.urgent
          ? "border-amber-400/45 bg-amber-500/18"
          : "border-sky-400/35 bg-sky-500/12";
    const countdownTextClass = done
      ? "text-emerald-700 dark:text-emerald-300"
      : countdown.overdue
        ? "text-rose-700 dark:text-rose-300"
        : countdown.urgent
          ? "text-amber-700 dark:text-amber-300"
          : "text-sky-700 dark:text-sky-300";

    return (
      <View
        key={task.id}
        className={`mb-2.5 rounded-2xl border px-3.5 py-3 ${
          done
            ? "border-slate-300/25 bg-white/20 opacity-65 dark:border-white/[0.06] dark:bg-white/[0.03]"
            : "border-slate-300/35 bg-white/40 dark:border-white/10 dark:bg-white/[0.06]"
        }`}
      >
        <View className="flex-row items-start">
          <Pressable
            onPress={() => {
              selectHaptic();
              toggleCourseTask(task.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? "标记为未完成" : "标记为已完成"}
            hitSlop={8}
            className={`mr-3 mt-0.5 h-5 w-5 items-center justify-center rounded-full border ${
              done
                ? "border-emerald-500 bg-emerald-500"
                : "border-slate-400/70 bg-transparent dark:border-slate-500"
            }`}
          >
            {done ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
          </Pressable>

          <Pressable
            onPress={() => openEditForm(task)}
            className="min-w-0 flex-1"
          >
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                <View className={`rounded-md border px-1.5 py-0.5 ${typeStyle.badge}`}>
                  <Text className={`text-[9.5px] font-bold ${typeStyle.text}`}>
                    {TASK_TYPES[task.type]}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-[13.5px] font-bold ${
                    done
                      ? "text-slate-500 line-through dark:text-slate-400"
                      : "text-slate-800 dark:text-white"
                  }`}
                >
                  {task.title}
                </Text>
              </View>

              <View className={`shrink-0 rounded-full border px-2 py-0.5 ${countdownBadgeClass}`}>
                <Text className={`text-[10px] font-bold ${countdownTextClass}`}>
                  {done ? "已完成" : countdown.label}
                </Text>
              </View>
            </View>

            <View className="mt-1.5 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
              <View className="flex-row items-center">
                <Ionicons name="time-outline" size={11} color="#94A3B8" />
                <Text className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {formatDueDisplay(task.dueAt)}
                </Text>
              </View>

              {task.course?.courseName ? (
                <View className="flex-row items-center rounded-md bg-slate-400/15 px-1.5 py-0.5 dark:bg-white/[0.08]">
                  <Text
                    numberOfLines={1}
                    className="text-[10px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    {task.course.courseName}
                  </Text>
                </View>
              ) : null}

              {task.reminder > 0 && !done ? (
                <View className="flex-row items-center">
                  <Ionicons name="notifications-outline" size={10.5} color="#38BDF8" />
                  <Text className="ml-0.5 text-[10px] text-sky-600 dark:text-sky-300">
                    {REMINDER_LABELS[task.reminder]}
                  </Text>
                </View>
              ) : null}
            </View>

            {task.type === "exam" && (task.location || task.seat || task.examMode) ? (
              <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
                {task.examMode ? (
                  <View className="rounded-md border border-rose-400/30 bg-rose-500/10 px-1.5 py-0.5">
                    <Text className="text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                      {EXAM_MODES[task.examMode]}
                    </Text>
                  </View>
                ) : null}
                {task.location ? (
                  <View className="flex-row items-center rounded-md bg-amber-500/12 px-1.5 py-0.5">
                    <Ionicons name="location-outline" size={10} color="#F59E0B" />
                    <Text className="ml-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      考场 {task.location}
                    </Text>
                  </View>
                ) : null}
                {task.seat ? (
                  <View className="rounded-md bg-slate-400/15 px-1.5 py-0.5 dark:bg-white/[0.08]">
                    <Text className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                      座位 {task.seat}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {task.note ? (
              <Text
                numberOfLines={2}
                className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {task.note}
              </Text>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => confirmDeleteTask(task)}
            accessibilityRole="button"
            accessibilityLabel={`删除 ${task.title}`}
            hitSlop={8}
            className="ml-2 mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-slate-400/10 dark:bg-white/[0.06]"
          >
            <Ionicons name="trash-outline" size={13.5} color="#94A3B8" />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderExamTicket = (
    ticket: ExamTicketItem,
    index: number,
    total: number,
  ) => {
    const { task, countdown } = ticket;
    const isLast = index === total - 1;
    const dotColor = countdown.overdue
      ? "bg-rose-500"
      : ticket.isToday || countdown.urgent
        ? "bg-amber-500"
        : "bg-sky-500";
    const badgeClass = countdown.overdue
      ? "border-rose-500/45 bg-rose-500/18"
      : ticket.isToday || countdown.urgent
        ? "border-amber-400/50 bg-amber-500/18"
        : "border-sky-400/40 bg-sky-500/15";
    const badgeTextClass = countdown.overdue
      ? "text-rose-700 dark:text-rose-300"
      : ticket.isToday || countdown.urgent
        ? "text-amber-700 dark:text-amber-300"
        : "text-sky-700 dark:text-sky-300";

    return (
      <View key={task.id} className="flex-row">
        {/* 左侧时间轴轨 */}
        <View className="mr-2.5 items-center pt-3">
          <View
            className={`h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${dotColor}`}
          />
          {!isLast ? (
            <View className="mt-1 w-[1.5px] flex-1 bg-rose-400/30 dark:bg-rose-400/20" />
          ) : null}
        </View>

        {/* 右侧准考证票面卡片 */}
        <Pressable
          onPress={() => openEditForm(task)}
          className="mb-3 flex-1 rounded-2xl border border-rose-400/35 bg-white/45 p-3.5 dark:border-rose-400/20 dark:bg-white/[0.06]"
        >
          {/* 票头：日期时间 + 考试形式 + 倒计时 */}
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={12} color="#F43F5E" />
              <Text
                numberOfLines={1}
                className="text-[11.5px] font-bold text-rose-700 dark:text-rose-300"
              >
                {ticket.dateTimeLabel}
              </Text>
              {ticket.examModeLabel ? (
                <View className="rounded-md border border-rose-400/35 bg-rose-500/12 px-1.5 py-0.5">
                  <Text className="text-[9.5px] font-bold text-rose-700 dark:text-rose-300">
                    {ticket.examModeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <View className={`shrink-0 rounded-full border px-2 py-0.5 ${badgeClass}`}>
              <Text className={`text-[10px] font-bold ${badgeTextClass}`}>
                {countdown.label}
              </Text>
            </View>
          </View>

          {/* 考试科目名与关联课程 */}
          <View className="mt-1.5 flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-[14.5px] font-extrabold text-slate-800 dark:text-white"
              >
                {task.title}
              </Text>
              {task.course?.courseName && task.course.courseName !== task.title ? (
                <Text
                  numberOfLines={1}
                  className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
                >
                  科目：{task.course.courseName}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => {
                selectHaptic();
                toggleCourseTask(task.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`标记 ${task.title} 已考完`}
              hitSlop={8}
              className="flex-row items-center rounded-full border border-emerald-400/40 bg-emerald-500/12 px-2 py-1"
            >
              <Ionicons name="checkmark-circle-outline" size={12} color="#10B981" />
              <Text className="ml-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                考完
              </Text>
            </Pressable>
          </View>

          {/* 准考证虚线分隔 */}
          <View className="my-2.5 border-t border-dashed border-rose-400/30 dark:border-rose-300/20" />

          {/* 考场 + 座位双栏存根 */}
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-xl bg-amber-500/10 px-2.5 py-1.5 dark:bg-amber-400/10">
              <Text className="text-[9.5px] font-semibold text-amber-700/80 dark:text-amber-300/80">
                考场地点
              </Text>
              <Text
                numberOfLines={1}
                className={`mt-0.5 text-[12px] font-bold ${
                  ticket.location
                    ? "text-slate-800 dark:text-slate-100"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {ticket.location || "点击补充考场"}
              </Text>
            </View>
            <View className="w-28 rounded-xl bg-sky-500/10 px-2.5 py-1.5 dark:bg-sky-400/10">
              <Text className="text-[9.5px] font-semibold text-sky-700/80 dark:text-sky-300/80">
                座位号
              </Text>
              <Text
                numberOfLines={1}
                className={`mt-0.5 text-[12px] font-bold ${
                  ticket.seat
                    ? "text-slate-800 dark:text-slate-100"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {ticket.seat || "待填"}
              </Text>
            </View>
          </View>

          {task.note ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="information-circle-outline" size={11.5} color="#94A3B8" />
              <Text
                numberOfLines={1}
                className="ml-1 flex-1 text-[10.5px] text-slate-500 dark:text-slate-400"
              >
                {task.note}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Animated.View
              entering={
                reducedMotion
                  ? undefined
                  : FadeInDown.duration(220).easing(Easing.out(Easing.cubic))
              }
            >
              <GlassContainer
                variant="sheet"
                radius={32}
                borderOpacity={0.3}
                style={{ height: sheetH, paddingBottom: bottomSafePad }}
              >
                {/* 头部 */}
                <View className="flex-row items-center justify-between px-5 pb-3 pt-5">
                  <View className="min-w-0 flex-1 flex-row items-center pr-2">
                    {viewMode === "form" ? (
                      <Pressable
                        onPress={() => {
                          setViewMode("list");
                          setEditingId(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="返回待办列表"
                        className="mr-2.5 h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                      >
                        <Ionicons name="chevron-back" size={16} color="#64748B" />
                      </Pressable>
                    ) : null}
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        className="text-[17px] font-bold text-slate-800 dark:text-white"
                      >
                        {viewMode === "list"
                          ? "作业与考试倒计时"
                          : editingId
                            ? "编辑待办"
                            : "新建作业 / 考试"}
                      </Text>
                      <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {viewMode === "list"
                          ? `待完成 ${counts.pending} 项 · 已完成 ${counts.completed} 项`
                          : "支持自动本地提醒与大肥鱼考前感知"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    {viewMode === "list" ? (
                      <Pressable
                        onPress={() => openCreateForm()}
                        accessibilityRole="button"
                        className="flex-row items-center rounded-full bg-sky-500 px-3 py-1.5"
                      >
                        <Ionicons name="add" size={14} color="#FFFFFF" />
                        <Text className="ml-0.5 text-[12px] font-bold text-white">
                          新建
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={onClose}
                      accessibilityRole="button"
                      accessibilityLabel="关闭"
                      className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                    >
                      <Ionicons name="close" size={16} color="#64748B" />
                    </Pressable>
                  </View>
                </View>

                {viewMode === "list" ? (
                  <>
                    {/* 分类筛选 */}
                    <View className="px-5 pb-2.5">
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 6 }}
                      >
                        {(
                          [
                            ["all", "全部"],
                            ["examWeek", "考试周准考证"],
                            ["homework", "作业"],
                            ["exam", "考试"],
                            ["review", "复习"],
                          ] as const
                        ).map(([key, label]) => {
                          const selected = filter === key;
                          const isExamWeek = key === "examWeek";
                          return (
                            <Pressable
                              key={key}
                              onPress={() => {
                                selectHaptic();
                                setFilter(key);
                              }}
                              className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                                selected
                                  ? isExamWeek
                                    ? "border-rose-400/75 bg-rose-500/20"
                                    : "border-sky-400/75 bg-sky-500/20"
                                  : isExamWeek
                                    ? "border-rose-400/35 bg-rose-500/10 dark:border-rose-400/25 dark:bg-rose-400/10"
                                    : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                              }`}
                            >
                              {isExamWeek ? (
                                <Ionicons
                                  name="card-outline"
                                  size={12}
                                  color={selected ? "#E11D48" : "#F43F5E"}
                                  style={{ marginRight: 4 }}
                                />
                              ) : null}
                              <Text
                                className={`text-[11.5px] font-semibold ${
                                  selected
                                    ? isExamWeek
                                      ? "text-rose-700 dark:text-rose-300"
                                      : "text-sky-700 dark:text-sky-300"
                                    : isExamWeek
                                      ? "text-rose-700/90 dark:text-rose-300/90"
                                      : "text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {label}
                              </Text>
                              {counts.byType[key] > 0 ? (
                                <Text
                                  className={`ml-1 text-[10.5px] font-bold ${
                                    selected
                                      ? isExamWeek
                                        ? "text-rose-600 dark:text-rose-300"
                                        : "text-sky-600 dark:text-sky-300"
                                      : isExamWeek
                                        ? "text-rose-500 dark:text-rose-400"
                                        : "text-slate-400 dark:text-slate-500"
                                  }`}
                                >
                                  {counts.byType[key]}
                                </Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>

                    {/* 列表 / 考试周准考证时间轴 */}
                    <ScrollView
                      className="flex-1 px-5"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 20 }}
                    >
                      {filter === "examWeek" ? (
                        <>
                          {/* 考试周总览头卡 */}
                          <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-rose-400/35 bg-rose-500/10 px-3.5 py-2.5 dark:border-rose-400/20 dark:bg-rose-500/12">
                            <View className="min-w-0 flex-1 pr-2">
                              <Text className="text-[13px] font-extrabold text-rose-700 dark:text-rose-200">
                                考试周 · 电子准考证
                              </Text>
                              <Text
                                numberOfLines={1}
                                className="mt-0.5 text-[11px] text-rose-700/80 dark:text-rose-300/80"
                              >
                                {examTimeline.length > 0
                                  ? `待考 ${examTimeline.length} 场 · 下一场 ${examTimeline[0].courseName}（${examTimeline[0].countdown.label}）`
                                  : "集中查看考试时间、考场号、座位号与开闭卷要求"}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => openCreateForm(null, "exam")}
                              accessibilityRole="button"
                              className="shrink-0 flex-row items-center rounded-full bg-rose-500 px-2.5 py-1.5"
                            >
                              <Ionicons name="add" size={13} color="#FFFFFF" />
                              <Text className="ml-0.5 text-[11px] font-bold text-white">
                                录考试
                              </Text>
                            </Pressable>
                          </View>

                          {examTimeline.length === 0 ? (
                            <View className="mt-4 items-center rounded-3xl border border-dashed border-rose-300/50 bg-white/20 px-6 py-10 dark:border-rose-400/20 dark:bg-white/[0.03]">
                              <Ionicons
                                name="school-outline"
                                size={28}
                                color="#F43F5E"
                              />
                              <Text className="mt-2.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">
                                暂无待考科目
                              </Text>
                              <Text className="mt-1 text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                                录入考试时间、考场、座位号与开闭卷形式，自动生成考试周时间轴
                              </Text>
                              <Pressable
                                onPress={() => openCreateForm(null, "exam")}
                                className="mt-4 rounded-full bg-rose-500 px-5 py-2"
                              >
                                <Text className="text-[12px] font-semibold text-white">
                                  添加第一场考试
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            examTimeline.map((ticket, idx) =>
                              renderExamTicket(ticket, idx, examTimeline.length),
                            )
                          )}
                        </>
                      ) : pendingList.length === 0 && completedList.length === 0 ? (
                        <View className="mt-6 items-center rounded-3xl border border-dashed border-slate-300/50 bg-white/20 px-6 py-10 dark:border-white/10 dark:bg-white/[0.03]">
                          <Ionicons
                            name="calendar-clear-outline"
                            size={28}
                            color="#94A3B8"
                          />
                          <Text className="mt-2.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">
                            还没有待办任务
                          </Text>
                          <Text className="mt-1 text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                            记下作业 DDL、考试时间和考场座位，到期自动提醒
                          </Text>
                          <Pressable
                            onPress={() => openCreateForm()}
                            className="mt-4 rounded-full bg-sky-500 px-5 py-2"
                          >
                            <Text className="text-[12px] font-semibold text-white">
                              添加作业或考试
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          {/* 全部/考试视角下提供一键进入「考试周准考证」紧凑入口卡 */}
                          {(filter === "all" || filter === "exam") &&
                          examTimeline.length > 0 ? (
                            <Pressable
                              onPress={() => {
                                selectHaptic();
                                setFilter("examWeek");
                              }}
                              accessibilityRole="button"
                              className="mb-2.5 flex-row items-center justify-between rounded-2xl border border-rose-400/35 bg-rose-500/10 px-3.5 py-2.5 dark:border-rose-400/20 dark:bg-rose-500/12"
                            >
                              <View className="min-w-0 flex-1 flex-row items-center pr-2">
                                <Ionicons
                                  name="card-outline"
                                  size={15}
                                  color="#F43F5E"
                                />
                                <View className="ml-2 min-w-0 flex-1">
                                  <Text
                                    numberOfLines={1}
                                    className="text-[12px] font-bold text-rose-700 dark:text-rose-200"
                                  >
                                    考试周准考证 · {examTimeline.length} 场待考
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    className="mt-0.5 text-[10.5px] text-rose-700/80 dark:text-rose-300/80"
                                  >
                                    下一场：{examTimeline[0].courseName} ·{" "}
                                    {examTimeline[0].dateLabel}{" "}
                                    {examTimeline[0].timeLabel}
                                    {examTimeline[0].location
                                      ? ` · ${examTimeline[0].location}`
                                      : ""}
                                    {examTimeline[0].seat
                                      ? ` ${examTimeline[0].seat}`
                                      : ""}
                                  </Text>
                                </View>
                              </View>
                              <View className="shrink-0 flex-row items-center">
                                <Text className="text-[11px] font-bold text-rose-600 dark:text-rose-300">
                                  准考证
                                </Text>
                                <Ionicons
                                  name="chevron-forward"
                                  size={13}
                                  color="#F43F5E"
                                />
                              </View>
                            </Pressable>
                          ) : null}

                          {pendingList.map(renderTaskRow)}

                          {completedList.length > 0 ? (
                            <View className="mt-2">
                              <View className="mb-2 flex-row items-center justify-between">
                                <Pressable
                                  onPress={() => setShowCompleted((v) => !v)}
                                  className="flex-row items-center py-1"
                                >
                                  <Ionicons
                                    name={
                                      showCompleted
                                        ? "chevron-down"
                                        : "chevron-forward"
                                    }
                                    size={13}
                                    color="#94A3B8"
                                  />
                                  <Text className="ml-1 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                                    已完成 ({completedList.length})
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => {
                                    selectHaptic();
                                    clearCompletedCourseTasks();
                                  }}
                                  className="rounded-full px-2 py-1"
                                >
                                  <Text className="text-[11px] font-semibold text-rose-500 dark:text-rose-400">
                                    清空已完成
                                  </Text>
                                </Pressable>
                              </View>
                              {showCompleted
                                ? completedList.map(renderTaskRow)
                                : null}
                            </View>
                          ) : null}
                        </>
                      )}
                    </ScrollView>
                  </>
                ) : (
                  /* 新建 / 编辑表单 */
                  <ScrollView
                    className="flex-1 px-5"
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 24 }}
                  >
                    {/* 任务类型 */}
                    <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      类型
                    </Text>
                    <View className="mb-3 flex-row gap-2">
                      {(["homework", "exam", "review"] as const).map((t) => {
                        const selected = taskType === t;
                        const style = TYPE_STYLE[t];
                        return (
                          <Pressable
                            key={t}
                            onPress={() => {
                              selectHaptic();
                              setTaskType(t);
                            }}
                            className={`flex-1 flex-row items-center justify-center rounded-2xl border py-2.5 ${
                              selected
                                ? style.active
                                : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                            }`}
                          >
                            <Ionicons
                              name={style.icon}
                              size={14}
                              color={
                                selected
                                  ? t === "exam"
                                    ? "#F43F5E"
                                    : t === "review"
                                      ? "#8B5CF6"
                                      : "#0EA5E9"
                                  : "#94A3B8"
                              }
                            />
                            <Text
                              className={`ml-1.5 text-[12.5px] font-bold ${
                                selected
                                  ? style.text
                                  : "text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {TASK_TYPES[t]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* 标题 */}
                    <View className="mb-3">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {taskType === "exam" ? "考试名称" : "任务名称"}
                      </Text>
                      <TextInput
                        value={title}
                        onChangeText={setTitle}
                        maxLength={120}
                        placeholder={
                          taskType === "exam"
                            ? "例如：高等数学期末考试"
                            : taskType === "review"
                              ? "例如：复习数据结构第 4 章"
                              : "例如：线性代数第 3 次作业"
                        }
                        placeholderTextColor="rgba(148,163,184,0.75)"
                        className="rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                      />
                    </View>

                    {/* 关联课程 */}
                    <View className="mb-3">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        关联课程（可选）
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 6 }}
                      >
                        <Pressable
                          onPress={() => setLinkedCourse(undefined)}
                          className={`rounded-full border px-3 py-1.5 ${
                            !linkedCourse
                              ? "border-sky-400/75 bg-sky-500/20"
                              : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                          }`}
                        >
                          <Text
                            className={`text-[11.5px] font-semibold ${
                              !linkedCourse
                                ? "text-sky-700 dark:text-sky-300"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            不关联
                          </Text>
                        </Pressable>
                        {distinctCourses.map((c) => {
                          const selected =
                            linkedCourse?.courseName === c.name ||
                            linkedCourse?.courseId === c.id;
                          return (
                            <Pressable
                              key={c.id}
                              onPress={() =>
                                setLinkedCourse({
                                  scheduleId: schedule.id,
                                  courseId: c.id,
                                  courseName: c.name,
                                })
                              }
                              className={`rounded-full border px-3 py-1.5 ${
                                selected
                                  ? "border-sky-400/75 bg-sky-500/20"
                                  : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                              }`}
                            >
                              <Text
                                numberOfLines={1}
                                className={`text-[11.5px] font-semibold ${
                                  selected
                                    ? "text-sky-700 dark:text-sky-300"
                                    : "text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {c.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>

                    {/* 截止 / 考试时间 */}
                    <View className="mb-3">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {taskType === "exam" ? "考试时间" : "截止时间"}
                      </Text>
                      <View className="mb-2 flex-row flex-wrap gap-1.5">
                        {(
                          [
                            ["今晚 22:00", 0, 22, 0],
                            ["明天 09:00", 1, 9, 0],
                            ["3天后", 3, 21, 0],
                            ["1周后", 7, 9, 0],
                          ] as const
                        ).map(([label, d, h, m]) => (
                          <Pressable
                            key={label}
                            onPress={() => applyQuickPreset(d, h, m)}
                            className="rounded-full border border-slate-300/35 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
                          >
                            <Text className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {Platform.OS === "web" ? (
                        <View className="flex-row gap-2">
                          <TextInput
                            value={dateInput}
                            onChangeText={setDateInput}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="rgba(148,163,184,0.75)"
                            className="flex-1 rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[13.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                          />
                          <TextInput
                            value={timeInput}
                            onChangeText={setTimeInput}
                            placeholder="HH:mm"
                            placeholderTextColor="rgba(148,163,184,0.75)"
                            className="w-28 rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[13.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                          />
                        </View>
                      ) : (
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => openNativePicker("date")}
                            className="flex-1 flex-row items-center justify-between rounded-2xl border border-slate-300/35 bg-white/45 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.07]"
                          >
                            <View className="flex-row items-center">
                              <Ionicons
                                name="calendar-outline"
                                size={15}
                                color="#38BDF8"
                              />
                              <Text className="ml-2 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                                {dateInput}
                              </Text>
                            </View>
                            <Text className="text-[10.5px] text-slate-400">
                              选日期
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openNativePicker("time")}
                            className="w-36 flex-row items-center justify-between rounded-2xl border border-slate-300/35 bg-white/45 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.07]"
                          >
                            <View className="flex-row items-center">
                              <Ionicons
                                name="time-outline"
                                size={15}
                                color="#38BDF8"
                              />
                              <Text className="ml-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                                {timeInput}
                              </Text>
                            </View>
                            <Text className="text-[10.5px] text-slate-400">
                              时间
                            </Text>
                          </Pressable>
                        </View>
                      )}

                      {Platform.OS === "ios" && iosPicker ? (
                        <View className="mt-2 rounded-2xl border border-slate-300/30 bg-white/35 p-2 dark:border-white/10 dark:bg-white/[0.06]">
                          <DateTimePicker
                            value={new Date(dueAt)}
                            mode={iosPicker}
                            is24Hour
                            onValueChange={(_e, selected) => {
                              if (!selected) return;
                              const merged = new Date(dueAt);
                              if (iosPicker === "date") {
                                merged.setFullYear(
                                  selected.getFullYear(),
                                  selected.getMonth(),
                                  selected.getDate(),
                                );
                              } else {
                                merged.setHours(
                                  selected.getHours(),
                                  selected.getMinutes(),
                                  0,
                                  0,
                                );
                              }
                              applyDueTimestamp(merged.getTime());
                            }}
                            onDismiss={() => setIosPicker(null)}
                          />
                          <Pressable
                            onPress={() => setIosPicker(null)}
                            className="mt-1 items-center rounded-xl bg-sky-500/20 py-2"
                          >
                            <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">
                              完成
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>

                    {/* 提前提醒 */}
                    <View className="mb-3">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        本地提醒
                      </Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {TASK_REMINDERS.map((mins) => {
                          const selected = reminder === mins;
                          return (
                            <Pressable
                              key={mins}
                              onPress={() => {
                                selectHaptic();
                                setReminder(mins);
                              }}
                              className={`rounded-full border px-3 py-1.5 ${
                                selected
                                  ? "border-sky-400/75 bg-sky-500/20"
                                  : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                              }`}
                            >
                              <Text
                                className={`text-[11.5px] font-semibold ${
                                  selected
                                    ? "text-sky-700 dark:text-sky-300"
                                    : "text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {REMINDER_LABELS[mins]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* 考试专属字段 */}
                    {taskType === "exam" ? (
                      <View className="mb-3 rounded-2xl border border-rose-400/25 bg-rose-500/[0.05] p-3 dark:border-rose-400/20 dark:bg-rose-400/[0.06]">
                        <Text className="mb-2 text-[11.5px] font-bold text-rose-700 dark:text-rose-300">
                          考场信息（可选）
                        </Text>
                        <View className="mb-2.5 flex-row gap-2">
                          {(["closed", "open", "paper"] as const).map((m) => {
                            const selected = examMode === m;
                            return (
                              <Pressable
                                key={m}
                                onPress={() =>
                                  setExamMode((prev) => (prev === m ? undefined : m))
                                }
                                className={`flex-1 items-center rounded-xl border py-2 ${
                                  selected
                                    ? "border-rose-400/75 bg-rose-500/20"
                                    : "border-slate-300/35 bg-white/40 dark:border-white/10 dark:bg-white/[0.06]"
                                }`}
                              >
                                <Text
                                  className={`text-[11.5px] font-semibold ${
                                    selected
                                      ? "text-rose-700 dark:text-rose-300"
                                      : "text-slate-600 dark:text-slate-300"
                                  }`}
                                >
                                  {EXAM_MODES[m]}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View className="flex-row gap-2">
                          <TextInput
                            value={location}
                            onChangeText={setLocation}
                            maxLength={80}
                            placeholder="考场号 / 教室（如 教三-201）"
                            placeholderTextColor="rgba(148,163,184,0.75)"
                            className="flex-1 rounded-xl border border-slate-300/35 bg-white/60 px-3 py-2 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-100"
                          />
                          <TextInput
                            value={seat}
                            onChangeText={setSeat}
                            maxLength={32}
                            placeholder="座位号"
                            placeholderTextColor="rgba(148,163,184,0.75)"
                            className="w-24 rounded-xl border border-slate-300/35 bg-white/60 px-3 py-2 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-100"
                          />
                        </View>
                      </View>
                    ) : null}

                    {/* 备注 */}
                    <View className="mb-4">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        备注（可选）
                      </Text>
                      <TextInput
                        value={note}
                        onChangeText={setNote}
                        maxLength={200}
                        multiline
                        textAlignVertical="top"
                        style={{ minHeight: 64 }}
                        placeholder="携带计算器/学生证、提交平台或复习重点"
                        placeholderTextColor="rgba(148,163,184,0.75)"
                        className="rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[13.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                      />
                    </View>

                    {/* 提交 */}
                    <Pressable
                      onPress={handleSave}
                      accessibilityRole="button"
                      className="items-center rounded-2xl bg-sky-500 py-3.5"
                    >
                      <Text className="text-[14.5px] font-bold text-white">
                        {editingId ? "保存修改" : "添加待办"}
                      </Text>
                    </Pressable>
                  </ScrollView>
                )}
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}

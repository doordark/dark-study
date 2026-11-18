import { memo, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { CourseTaskForm } from "@/components/CourseTaskForm";
import { useStore } from "@/store/useStore";
import { TASK_TYPES, nextCourse, todayTasks, weekAgenda, type CourseTask } from "@/utils/courseTasks";
import { formatClock, toIsoDate } from "@/utils/time";
import type { Schedule } from "@/types";

type Panel = "list" | "new" | "week" | CourseTask | null;
const actionStyle = "min-h-9 justify-center rounded-xl bg-sky-400/15 px-3";
const actionText = "text-xs font-semibold text-sky-700 dark:text-sky-300";
const subtle = "text-xs text-slate-600 dark:text-slate-300";
const taskKey = (item: CourseTask) => item.id;

function dateLabel(date: Date, now: Date) {
  return toIsoDate(date) === toIsoDate(now) ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`;
}

const TaskRow = memo(function TaskRow({ task, now, onEdit }: {
  task: CourseTask; now: Date; onEdit: (task: CourseTask) => void;
}) {
  const done = task.completedAt !== undefined;
  const overdue = !done && task.dueAt < now.getTime();
  const due = new Date(task.dueAt);
  return <View className="flex-row items-center gap-2 border-b border-slate-400/15 py-1">
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.title} 已完成`} accessibilityState={{ checked: done }}
      onPress={() => useStore.getState().toggleCourseTask(task.id)} className="h-11 w-11 items-center justify-center">
      <View className={`h-6 w-6 items-center justify-center rounded-lg border ${done ? "border-emerald-500 bg-emerald-500/20" : "border-slate-400/70"}`}>
        <Text className="font-bold text-emerald-700 dark:text-emerald-300">{done ? "✓" : ""}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`编辑待办 ${task.title}`} onPress={() => onEdit(task)} className="min-h-11 flex-1 justify-center py-1">
      <Text className={`font-semibold text-slate-800 dark:text-slate-100 ${done ? "line-through opacity-70" : ""}`}>{task.title}</Text>
      <Text className={overdue ? "text-xs text-rose-600 dark:text-rose-300" : subtle}>
        {TASK_TYPES[task.type]}{task.course ? ` · ${task.course.courseName}` : ""} · {dateLabel(due, now)} {formatClock(due)}{overdue ? " · 已逾期" : ""}
      </Text>
    </Pressable>
  </View>;
});

export const TodayAgenda = memo(function TodayAgenda({ schedule, now }: { schedule: Schedule; now: Date }) {
  const tasks = useStore(state => state.courseTasks);
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [returnTo, setReturnTo] = useState<"list" | "week">("list");
  const [showCompleted, setShowCompleted] = useState(false);
  const { due, exam } = useMemo(() => todayTasks(tasks, now), [tasks, now]);
  const next = useMemo(() => nextCourse(schedule, now), [schedule, now]);
  const browsing = panel === "list";
  const weekOpen = panel === "week";
  const agenda = useMemo(() => weekOpen ? weekAgenda(schedule, tasks, now) : [], [weekOpen, schedule, tasks, now]);
  const visibleTasks = useMemo(() => browsing
    ? tasks.filter(task => (task.completedAt !== undefined) === showCompleted).sort((a, b) => a.dueAt - b.dueAt) : [],
  [browsing, tasks, showCompleted]);
  const close = () => { setPanel(null); setReturnTo("list"); };
  const showList = () => setPanel("list");
  const editFromWeek = (task: CourseTask) => { setReturnTo("week"); setPanel(task); };
  const backFromEditor = () => { setPanel(returnTo); setReturnTo("list"); };
  const selectedTask = typeof panel === "object" && panel !== null ? tasks.find(task => task.id === panel.id) : undefined;
  return <>
    <View className="mx-5 mb-1 mt-1.5 rounded-2xl border border-slate-400/20 bg-white/65 px-3.5 dark:bg-slate-800/65">
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel="今日安排" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
          className="min-h-12 flex-1 justify-center py-1.5">
          <Text className="text-sm font-bold text-slate-900 dark:text-white">今天 {due.length ? ` · ${due.length} 项待办` : ""} {expanded ? "▴" : "▾"}</Text>
          <Text numberOfLines={1} className={subtle}>{next
            ? `下一节 · ${dateLabel(next.date, now)} ${next.time} ${next.course.name}`
            : "本学期暂无后续课程"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="添加待办" onPress={() => setPanel("new")} className={actionStyle}>
          <Text className={actionText}>＋ 待办</Text>
        </Pressable>
      </View>
      {expanded ? <View className="gap-1 pb-2">
        {due.length ? due.slice(0, 3).map(task => <TaskRow key={task.id} task={task} now={now} onEdit={setPanel} />)
          : <Text className={subtle}>今天没有到期或逾期待办</Text>}
        {exam ? <Pressable accessibilityRole="button" onPress={() => setPanel(exam)} className="min-h-9 justify-center">
          <Text className={subtle}>下一场考试 · {dateLabel(new Date(exam.dueAt), now)} {formatClock(new Date(exam.dueAt))} · {exam.title}</Text>
        </Pressable> : null}
        <View className="flex-row flex-wrap gap-2">
          <Pressable accessibilityRole="button" onPress={showList} className={actionStyle}>
            <Text className={actionText}>查看全部待办{due.length > 3 ? ` · 还有 ${due.length - 3} 项到期` : ""}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setPanel("week")} className={actionStyle}>
            <Text className={actionText}>未来 7 天</Text>
          </Pressable>
        </View>
      </View> : null}
    </View>
    {panel !== null ? <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center bg-black/45 px-5">
        <View className="max-h-[86%] gap-3 rounded-3xl bg-white p-5 dark:bg-slate-900">
          {weekOpen ? <>
            <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">未来 7 天</Text>
            <Text className={subtle}>当前课表课程 · 未完成待办</Text>
            <SectionList sections={agenda} keyExtractor={item => item.key}
              style={{ flexGrow: 0, flexShrink: 1 }} stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <Text className="mt-3 rounded-lg bg-sky-400/10 px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {dateLabel(section.date, now)} · 周{["日", "一", "二", "三", "四", "五", "六"][section.date.getDay()]}
              </Text>}
              renderSectionFooter={({ section }) => section.data.length ? null : <Text className={`${subtle} px-2 py-2`}>暂无安排</Text>}
              renderItem={({ item }) => item.type === "task" ? <TaskRow task={item.task} now={now} onEdit={editFromWeek} /> :
                <View className="gap-1 border-b border-slate-400/15 px-2 py-2">
                  <Text className="font-semibold text-slate-800 dark:text-slate-100">{item.course.name}</Text>
                  <Text className={subtle}>上课 · {item.start}–{item.end}{item.course.classroom ? ` · ${item.course.classroom}` : ""}</Text>
                </View>} />
            <Pressable accessibilityRole="button" onPress={close} className={`${actionStyle} self-end`}><Text className={actionText}>关闭</Text></Pressable>
          </> : browsing ? <>
            <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">课程待办</Text>
            <View className="flex-row gap-2">
              {[false, true].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: showCompleted === value }}
                onPress={() => setShowCompleted(value)} className={actionStyle}>
                <Text className={actionText}>{showCompleted === value ? "✓ " : ""}{value ? "已完成" : "待完成"}</Text>
              </Pressable>)}
            </View>
            <FlatList data={visibleTasks} keyExtractor={taskKey} initialNumToRender={8}
              style={{ flexGrow: 0, flexShrink: 1 }} renderItem={({ item }) => <TaskRow task={item} now={now} onEdit={setPanel} />}
              ListEmptyComponent={<Text className={`${subtle} py-3`}>{showCompleted ? "还没有已完成事项" : "没有待完成事项"}</Text>} />
            <View className="flex-row justify-end gap-2">
              <Pressable accessibilityRole="button" onPress={close} className={actionStyle}><Text className={actionText}>关闭</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setPanel("new")} className={actionStyle}><Text className={actionText}>添加待办</Text></Pressable>
            </View>
          </> : panel === "new" || selectedTask ? <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            <CourseTaskForm key={selectedTask?.id ?? "new"} task={selectedTask} now={now} onClose={backFromEditor} onDone={backFromEditor} />
          </ScrollView> : <Pressable accessibilityRole="button" onPress={showList} className={actionStyle}>
            <Text className={actionText}>待办已删除，返回列表</Text>
          </Pressable>}
        </View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </>;
});

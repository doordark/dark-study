import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import type { WidgetCourse } from "@/utils/courseWidget";

/** 系统界面由用户保存，避免静默创建无法跟随调课撤销的系统记录。 */
export async function openCourseCalendar(course: WidgetCourse, minutes: number) {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统日历");
  await IntentLauncher.startActivityAsync("android.intent.action.INSERT", {
    data: "content://com.android.calendar/events",
    type: "vnd.android.cursor.dir/event",
    extra: {
      title: course.name,
      eventLocation: course.classroom,
      description: `${course.teacher ? `教师：${course.teacher}。` : ""}请在日历中设置提前 ${minutes} 分钟提醒。此日程为课表快照，调课后请在系统日历中同步修改。`,
      beginTime: course.start, endTime: course.end,
    },
  });
}

export async function openCourseAlarm(course: WidgetCourse, minutes: number, now = new Date()) {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统闹钟");
  const date = new Date(course.start - minutes * 60000);
  if (+date <= +now || +date - +now >= 86400000) throw new Error("系统闹钟只支持下一次时刻，请选择未来 24 小时内的课程；更远的日期请添加系统日程");
  await IntentLauncher.startActivityAsync("android.intent.action.SET_ALARM", {
    extra: {
      "android.intent.extra.alarm.HOUR": date.getHours(),
      "android.intent.extra.alarm.MINUTES": date.getMinutes(),
      "android.intent.extra.alarm.MESSAGE": `${course.name}${course.classroom ? ` · ${course.classroom}` : ""}`,
      "android.intent.extra.alarm.SKIP_UI": false,
    },
  });
}

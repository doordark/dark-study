import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { syncCourseReminders } from "@/services/courseReminders";
import { syncLiveClassNotification } from "@/services/liveClassNotification";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";

const LIVE_CLASS_INTERVAL_MS = 60_000;

export function CourseReminderSync() {
  const schedule = useActiveSchedule();
  const courseTasks = useStore((s) => s.courseTasks);
  const enabled = useSettings((s) => s.reminderEnabled);
  const minutes = useSettings((s) => s.reminderMinutes);
  const count = useSettings((s) => s.reminderCount);
  const liveClassNotification = useSettings((s) => s.liveClassNotification);
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const check = () => setReady(useStore.persist.hasHydrated() && useSettings.persist.hasHydrated());
    const a = useStore.persist.onFinishHydration(check);
    const b = useSettings.persist.onFinishHydration(check);
    check();
    const listener = AppState.addEventListener("change", (state) => {
      const isActive = state === "active";
      setForeground(isActive);
      if (isActive) setResume((v) => v + 1);
    });
    return () => { a(); b(); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => syncCourseReminders(schedule, enabled, minutes, count, courseTasks), 250);
    return () => clearTimeout(timer);
  }, [ready, schedule, courseTasks, enabled, minutes, count, resume]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void syncLiveClassNotification(schedule, liveClassNotification, minutes);
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, schedule, liveClassNotification, minutes, resume]);
  useEffect(() => {
    if (!ready || !liveClassNotification || !foreground) return;
    const interval = setInterval(() => {
      void syncLiveClassNotification(schedule, liveClassNotification, minutes);
    }, LIVE_CLASS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [ready, schedule, liveClassNotification, minutes, foreground]);
  return null;
}

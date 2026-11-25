import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { syncCourseReminders } from "@/services/courseReminders";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";

export function CourseReminderSync() {
  const schedule = useActiveSchedule();
  const enabled = useSettings((s) => s.reminderEnabled);
  const minutes = useSettings((s) => s.reminderMinutes);
  const count = useSettings((s) => s.reminderCount);
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState(0);
  useEffect(() => {
    const check = () => setReady(useStore.persist.hasHydrated() && useSettings.persist.hasHydrated());
    const a = useStore.persist.onFinishHydration(check);
    const b = useSettings.persist.onFinishHydration(check);
    check();
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") setResume((v) => v + 1); });
    return () => { a(); b(); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => syncCourseReminders(schedule, enabled, minutes, count), 250);
    return () => clearTimeout(timer);
  }, [ready, schedule, enabled, minutes, count, resume]);
  return null;
}

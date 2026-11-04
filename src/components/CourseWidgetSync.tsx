import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { syncCourseWidgets } from "@/services/courseWidget";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWidgetSettings } from "@/store/useWidgetSettings";

export function CourseWidgetSync() {
  const schedule = useActiveSchedule();
  const count = useWidgetSettings((s) => s.count);
  const theme = useWidgetSettings((s) => s.theme);
  const accent = useWidgetSettings((s) => s.accent);
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState(0);
  useEffect(() => {
    const check = () => setReady(useStore.persist.hasHydrated() && useWidgetSettings.persist.hasHydrated());
    const a = useStore.persist.onFinishHydration(check);
    const b = useWidgetSettings.persist.onFinishHydration(check);
    check();
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") setResume((v) => v + 1); });
    return () => { a(); b(); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Debounce edits; the native module serially persists the latest full schedule.
    const timer = setTimeout(() => {
      void syncCourseWidgets(schedule, count, theme, accent).catch((error) => console.warn("桌面课表同步失败", error));
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, schedule, count, theme, accent, resume]);
  return null;
}

import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { desktopPetAvailable, getDesktopPetStatus, requestDesktopPetPermission, startDesktopPet, stopDesktopPet } from "@/services/desktopPet";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useWhalePersona } from "@/store/useWhalePersona";

export function DesktopPetSettings() {
  const running = useDesktopPet((s) => s.running);
  const refresh = useDesktopPet((s) => s.refresh);
  const userName = useWhalePersona((s) => s.persona.userName);
  const reduced = useReducedMotion();
  const pendingPermission = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !pendingPermission.current) return;
      pendingPermission.current = false;
      void (async () => {
        try {
          const status = await getDesktopPetStatus();
          if (!status.permission) { setNotice("还没有悬浮窗权限，允许后才能到桌面陪你。"); return; }
          await startDesktopPet(userName, reduced);
          await refresh();
          setNotice("已经到桌面啦，按 Home 键就能看到。右上角 × 或通知栏可收回。");
        } catch (error) { setNotice(error instanceof Error ? error.message : "桌宠未能启动，请重试。"); }
        finally { setBusy(false); }
      })();
    });
    return () => sub.remove();
  }, [refresh, userName, reduced]);
  const toggle = async () => {
    setBusy(true); setNotice("");
    try {
      if (running) { await stopDesktopPet(); await refresh(); setNotice("桌面桌宠已收回。"); }
      else {
        const status = await getDesktopPetStatus();
        if (!status.permission) {
          pendingPermission.current = true;
          await requestDesktopPetPermission();
          setNotice("请允许显示在其他应用上层，然后返回本软件。");
          return;
        }
        await startDesktopPet(userName, reduced); await refresh();
        setNotice("已经到桌面啦，按 Home 键就能看到。右上角 × 或通知栏可收回。");
      }
    } catch (error) { pendingPermission.current = false; setNotice(error instanceof Error ? error.message : "操作失败，请重试。"); }
    finally { if (!pendingPermission.current) setBusy(false); }
  };
  return <View className="rounded-3xl bg-white/25 p-4 dark:bg-white/[0.05]">
    <Text className="text-[16px] font-bold text-slate-800 dark:text-white">去桌面陪你</Text>
    <Text className="mt-2 text-[12px] leading-6 text-slate-600 dark:text-slate-300">开启后，大肥鱼会出现在手机桌面和其他应用上方。拖动、轻抛、点一下挥手；用力撞到边框会捂头喊疼。熄屏后暂停动画。</Text>
    <Text className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">桌面模式和软件内桌宠共用角色贴图。聊天、喂饭和设置仍在软件内；右上角 × 或通知栏可随时收回。不会开机自动启动。</Text>
    {!desktopPetAvailable ? <Text className="mt-3 text-[12px] leading-6 text-amber-600 dark:text-amber-300">{Platform.OS === "android" ? "当前安装包还没有桌面悬浮模块，请安装重新打包的新 APK。Expo Go 不支持此功能。" : "应用外悬浮桌宠目前支持 Android 手机；网页和 iOS 保留软件内桌宠。"}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={running ? "收回桌面桌宠" : "开启桌面桌宠"} disabled={busy || !desktopPetAvailable} onPress={() => void toggle()} className={`mt-4 min-h-12 items-center justify-center rounded-2xl ${busy || !desktopPetAvailable ? "bg-slate-400/40" : running ? "bg-slate-600" : "bg-sky-500"}`}>
      <Text className="text-[13px] font-bold text-white">{busy ? "正在处理…" : running ? "收回桌面桌宠" : "开启桌面桌宠"}</Text>
    </Pressable>
    {notice ? <Text accessibilityLiveRegion="polite" className="mt-3 text-[12px] leading-5 text-sky-700 dark:text-sky-200">{notice}</Text> : null}
  </View>;
}

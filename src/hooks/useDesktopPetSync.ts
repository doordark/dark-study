import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  desktopPetAvailable,
  desktopPetSupportsHandoff,
  setDesktopPetVisible,
  startDesktopPet,
  stopDesktopPet,
  subscribeDesktopPet,
  updateDesktopPet,
  type DesktopPetOptions,
} from "@/services/desktopPet";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { useActiveSchedule } from "@/store/useStore";
import { describeWhaleEmotion } from "@/utils/whaleEmotion";
import { findUpcomingCourse } from "@/utils/whaleBehavior";

export function buildDesktopPetPayload(
  reducedMotion: boolean,
  startHidden = false,
): DesktopPetOptions {
  const persona = useWhalePersona.getState().persona;
  const pet = useWhalePet.getState();
  const memory = useWhaleMemory.getState();
  const desktop = useDesktopPet.getState();
  const emotionLabel = describeWhaleEmotion(memory.emotion).label;
  return {
    userName: persona.userName,
    petName: persona.name,
    reducedMotion,
    startHidden,
    ghostMode: desktop.ghostMode,
    edgeRest: desktop.edgeRest,
    scale: desktop.petScale,
    opacity: desktop.petOpacity,
    panelTheme: desktop.panelTheme,
    tapAction: desktop.tapAction,
    showBubbles: desktop.showBubbles,
    fullness: Math.round(pet.care.fullness),
    mood: Math.round(pet.care.mood),
    bond: Math.round(pet.care.bond),
    tsundere: persona.traits.tsundere,
    affection: persona.traits.affection,
    warmth: persona.traits.warmth,
    playfulness: persona.traits.playfulness,
    emotionLabel,
    normX: pet.lastNormX,
    normY: pet.lastNormY,
    face: pet.lastFace,
  };
}

/**
 * 桌面桌宠双端协调钩子：
 * 1. 前台预驻留隐身待命（Standby）：只要应用内召唤了桌宠且开启「后台自动随行」并有悬浮窗权限，
 *    前台先启动轻量化待命服务（View GONE，不占动画/贴图内存），切后台时 0ms 坐标接力显现到桌面；
 * 2. 回到前台时立刻隐身交还给应用内桌宠，并把桌面期间的喂饭/摸头/撞边事件全量同步回来；
 * 3. 在「始终常驻桌面」模式下保持原生悬浮层一直可见，并实时同步外观、透明度、主题、互动偏好与课程提醒。
 */
export function useDesktopPetSync() {
  const refresh = useDesktopPet((s) => s.refresh);
  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const overlayMode = useDesktopPet((s) => s.overlayMode);
  const petScale = useDesktopPet((s) => s.petScale);
  const petOpacity = useDesktopPet((s) => s.petOpacity);
  const panelTheme = useDesktopPet((s) => s.panelTheme);
  const tapAction = useDesktopPet((s) => s.tapAction);
  const showBubbles = useDesktopPet((s) => s.showBubbles);
  const permission = useDesktopPet((s) => s.permission);
  const running = useDesktopPet((s) => s.running);
  const petVisible = useWhalePet((s) => s.visible);
  const hydrated = useWhaleMemory((s) => s.hydrated);
  const persona = useWhalePersona((s) => s.persona);
  const schedule = useActiveSchedule();
  const reducedMotion = useReducedMotion();
  const standbyManaged = useRef(false);

  const makePayload = useCallback(
    (startHidden: boolean): DesktopPetOptions => {
      const base = buildDesktopPetPayload(reducedMotion, startHidden);
      const nextCourse = findUpcomingCourse(schedule, new Date(), 240);
      if (nextCourse) {
        base.nextCourseName = nextCourse.name;
        base.nextCoursePlace = nextCourse.classroom;
        base.nextCourseAtMs = nextCourse.startAtMs;
      }
      return base;
    },
    [reducedMotion, schedule],
  );

  // 基础状态监听 + 后台/前台 0ms 无缝接力
  useEffect(() => {
    if (!desktopPetAvailable) return;
    const sync = () => {
      void refresh().catch(() => {});
    };
    sync();
    const off = subscribeDesktopPet(sync);

    const stateSub = AppState.addEventListener("change", (next) => {
      const ds = useDesktopPet.getState();
      const inAppVisible = useWhalePet.getState().visible;

      if (next === "active") {
        // 回到前台：若处于 auto 模式，立刻隐身原生悬浮窗交还给应用内桌宠
        if (ds.overlayMode === "auto" && ds.running && desktopPetSupportsHandoff) {
          void setDesktopPetVisible(false).then(sync).catch(sync);
        } else {
          sync();
        }
        return;
      }

      // 切到后台 / 多任务界面：若开启了后台自动随行且应用内有桌宠，0ms 无缝显现到桌面！
      if (
        (next === "background" || next === "inactive") &&
        ds.autoFollowBackground &&
        ds.overlayMode === "auto" &&
        inAppVisible &&
        ds.permission
      ) {
        const payload = makePayload(false);
        if (ds.running && desktopPetSupportsHandoff) {
          void setDesktopPetVisible(true, payload).catch(() => {});
        } else {
          void startDesktopPet(payload).catch(() => {});
        }
      }
    });

    return () => {
      off();
      stateSub.remove();
    };
  }, [refresh, hydrated, makePayload]);

  // 前台预驻留待命管理：在应用内召出桌宠时提前静默启动 Standby，规避 Android 12–15 后台 FGS 启动拦截
  useEffect(() => {
    if (!desktopPetAvailable || !desktopPetSupportsHandoff) return;
    if (overlayMode !== "auto") {
      standbyManaged.current = false;
      return;
    }

    if (autoFollow && petVisible && permission) {
      if (!running && AppState.currentState === "active") {
        standbyManaged.current = true;
        void startDesktopPet(makePayload(true))
          .then(() => refresh())
          .catch(() => {
            standbyManaged.current = false;
          });
      } else if (running) {
        void updateDesktopPet(makePayload(AppState.currentState === "active")).catch(() => {});
      }
    } else if (standbyManaged.current && running && !petVisible) {
      // 用户主动收回应用内桌宠 → 同时收掉待命服务，零后台内存占用
      standbyManaged.current = false;
      void stopDesktopPet()
        .then(() => refresh())
        .catch(() => {});
    }
  }, [
    autoFollow,
    overlayMode,
    petVisible,
    permission,
    running,
    petScale,
    petOpacity,
    panelTheme,
    tapAction,
    showBubbles,
    persona,
    makePayload,
    refresh,
  ]);

  // 始终常驻模式下，外观/主题/互动偏好或人设变化实时同步给原生悬浮窗
  useEffect(() => {
    if (!desktopPetAvailable || !running || overlayMode !== "always") return;
    void updateDesktopPet(makePayload(false)).catch(() => {});
  }, [running, overlayMode, petScale, petOpacity, panelTheme, tapAction, showBubbles, persona, makePayload]);
}

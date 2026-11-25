import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type DesktopPanelTheme = "auto" | "dark" | "light";
export type DesktopTapAction = "interact" | "panel";

export interface DesktopPetStatus {
  permission: boolean;
  running: boolean;
  visible: boolean;
  ghostMode: boolean;
  edgeRest: boolean;
  panelOpen: boolean;
  lastImpactAt: number;
  lastImpactText: string;
  pendingFeeds: number;
  pendingPats: number;
  pendingPokes: number;
  batteryIgnored: boolean;
  manufacturer: string;
}

export interface DesktopPetOptions {
  userName: string;
  petName?: string;
  reducedMotion: boolean;
  /** true = 前台隐身待命（零绘制零占用），退后台时瞬间显现，规避 Android 12+ 后台启动 FGS 限制 */
  startHidden?: boolean;
  ghostMode?: boolean;
  edgeRest?: boolean;
  scale?: number;
  /** 桌宠本体透明度（0.55 - 1.0） */
  opacity?: number;
  /** 互动面板与气泡玻璃主题：auto 跟随系统 / dark 深海玻璃 / light 冰晶浅色 */
  panelTheme?: DesktopPanelTheme;
  /** 单击桌宠手势偏好：interact 摸头/戳戳互动，panel 单击直开互动卡片 */
  tapAction?: DesktopTapAction;
  /** 是否开启自主冒泡对话（直接喂饭/摸头等主动互动反馈仍会显示） */
  showBubbles?: boolean;
  fullness?: number;
  mood?: number;
  bond?: number;
  tsundere?: number;
  affection?: number;
  warmth?: number;
  playfulness?: number;
  emotionLabel?: string;
  nextCourseName?: string;
  nextCoursePlace?: string;
  nextCourseAtMs?: number;
  normX?: number;
  normY?: number;
  face?: number;
}

interface DesktopPetModule {
  getStatus: () => Promise<Partial<DesktopPetStatus>>;
  openPermission: () => Promise<void>;
  start: (options: string) => Promise<void>;
  update?: (options: string) => Promise<void>;
  setVisible?: (visible: boolean, options?: string) => Promise<void>;
  setGhostMode?: (enabled: boolean) => Promise<void>;
  setEdgeRest?: (enabled: boolean) => Promise<void>;
  openPanel?: () => Promise<void>;
  stop: () => Promise<void>;
  acknowledgeImpact: (at: number) => Promise<void>;
  acknowledgeCounters?: () => Promise<void>;
  requestIgnoreBatteryOptimizations?: () => Promise<void>;
  openAppSettings?: () => Promise<void>;
  addListener: (name: string) => void;
  removeListeners: (count: number) => void;
}

const native: DesktopPetModule | undefined =
  Platform?.OS === "android" ? NativeModules?.WhaleOverlay : undefined;

export const desktopPetAvailable = !!native;
export const desktopPetSupportsHandoff = !!native?.setVisible;
export const desktopPetSupportsPanel = !!native?.openPanel;

export const emptyDesktopPetStatus: DesktopPetStatus = {
  permission: false,
  running: false,
  visible: false,
  ghostMode: false,
  edgeRest: false,
  panelOpen: false,
  lastImpactAt: 0,
  lastImpactText: "",
  pendingFeeds: 0,
  pendingPats: 0,
  pendingPokes: 0,
  batteryIgnored: false,
  manufacturer: "",
};

export async function getDesktopPetStatus(): Promise<DesktopPetStatus> {
  if (!native) return emptyDesktopPetStatus;
  const raw = await native.getStatus();
  return {
    permission: !!raw.permission,
    running: !!raw.running,
    visible: raw.visible ?? !!raw.running,
    ghostMode: !!raw.ghostMode,
    edgeRest: !!raw.edgeRest,
    panelOpen: !!raw.panelOpen,
    lastImpactAt: Number(raw.lastImpactAt) || 0,
    lastImpactText: typeof raw.lastImpactText === "string" ? raw.lastImpactText : "",
    pendingFeeds: Number(raw.pendingFeeds) || 0,
    pendingPats: Number(raw.pendingPats) || 0,
    pendingPokes: Number(raw.pendingPokes) || 0,
    batteryIgnored: !!raw.batteryIgnored,
    manufacturer: typeof raw.manufacturer === "string" ? raw.manufacturer : "",
  };
}

export async function requestDesktopPetPermission() {
  if (native) await native.openPermission();
}

export async function startDesktopPet(
  optionsOrName: string | DesktopPetOptions,
  reducedMotion?: boolean,
) {
  if (!native) {
    throw new Error("请安装包含桌面悬浮功能的新 APK；Expo Go 和网页不支持应用外桌宠。");
  }
  const payload: DesktopPetOptions =
    typeof optionsOrName === "string"
      ? { userName: optionsOrName, reducedMotion: !!reducedMotion }
      : optionsOrName;
  await native.start(JSON.stringify(payload));
}

export async function updateDesktopPet(options: DesktopPetOptions) {
  if (!native) return;
  if (native.update) await native.update(JSON.stringify(options));
  else await native.start(JSON.stringify(options));
}

export async function setDesktopPetVisible(visible: boolean, options?: DesktopPetOptions) {
  if (!native) return;
  if (native.setVisible) {
    await native.setVisible(visible, options ? JSON.stringify(options) : "");
  } else if (visible && options) {
    await native.start(JSON.stringify(options));
  } else if (!visible) {
    await native.stop();
  }
}

export async function setDesktopPetGhostMode(enabled: boolean) {
  if (native?.setGhostMode) await native.setGhostMode(enabled);
}

export async function setDesktopPetEdgeRest(enabled: boolean) {
  if (native?.setEdgeRest) await native.setEdgeRest(enabled);
}

export async function openDesktopPetPanel() {
  if (native?.openPanel) await native.openPanel();
}

export async function stopDesktopPet() {
  if (native) await native.stop();
}

export async function acknowledgeDesktopImpact(at: number) {
  if (native) await native.acknowledgeImpact(at);
}

export async function acknowledgeDesktopCounters() {
  if (native?.acknowledgeCounters) await native.acknowledgeCounters();
}

export async function requestDesktopPetBatteryWhitelist() {
  if (native?.requestIgnoreBatteryOptimizations) {
    await native.requestIgnoreBatteryOptimizations();
  }
}

export async function openDesktopPetAppSettings() {
  if (native?.openAppSettings) await native.openAppSettings();
}

export function subscribeDesktopPet(callback: () => void) {
  if (!native) return () => {};
  const sub = new NativeEventEmitter(native).addListener("WhaleOverlayChanged", callback);
  return () => sub.remove();
}

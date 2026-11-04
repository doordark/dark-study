import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export interface DesktopPetStatus { permission: boolean; running: boolean; lastImpactAt: number; lastImpactText: string }
interface DesktopPetModule {
  getStatus: () => Promise<DesktopPetStatus>;
  openPermission: () => Promise<void>;
  start: (options: string) => Promise<void>;
  stop: () => Promise<void>;
  acknowledgeImpact: (at: number) => Promise<void>;
  addListener: (name: string) => void;
  removeListeners: (count: number) => void;
}
const native: DesktopPetModule | undefined = Platform.OS === "android" ? NativeModules.WhaleOverlay : undefined;
export const desktopPetAvailable = !!native;
export const emptyDesktopPetStatus: DesktopPetStatus = { permission: false, running: false, lastImpactAt: 0, lastImpactText: "" };
export const getDesktopPetStatus = () => native ? native.getStatus() : Promise.resolve(emptyDesktopPetStatus);
export async function requestDesktopPetPermission() { if (native) await native.openPermission(); }
export async function startDesktopPet(userName: string, reducedMotion: boolean) {
  if (!native) throw new Error("请安装包含桌面悬浮功能的新 APK；Expo Go 和网页不支持应用外桌宠。");
  await native.start(JSON.stringify({ userName, reducedMotion }));
}
export async function stopDesktopPet() { if (native) await native.stop(); }
export async function acknowledgeDesktopImpact(at: number) { if (native) await native.acknowledgeImpact(at); }
export function subscribeDesktopPet(callback: () => void) {
  if (!native) return () => {};
  const sub = new NativeEventEmitter(native).addListener("WhaleOverlayChanged", callback);
  return () => sub.remove();
}

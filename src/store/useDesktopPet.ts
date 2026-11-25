import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  acknowledgeDesktopCounters,
  acknowledgeDesktopImpact,
  emptyDesktopPetStatus,
  getDesktopPetStatus,
  setDesktopPetEdgeRest,
  setDesktopPetGhostMode,
  type DesktopPanelTheme,
  type DesktopPetStatus,
  type DesktopTapAction,
} from "@/services/desktopPet";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import { coordinatedJSONStorage } from "@/utils/storage";

export type DesktopOverlayMode = "auto" | "always";
export type { DesktopPanelTheme, DesktopTapAction };

interface DesktopPetStore extends DesktopPetStatus {
  /** 切后台时自动让原生桌宠在手机桌面显身接力（需悬浮窗权限） */
  autoFollowBackground: boolean;
  /** auto = 前台用应用内桌宠、切后台无缝换桌面悬浮；always = 始终显示系统顶层桌宠 */
  overlayMode: DesktopOverlayMode;
  /** 桌宠显示倍率：0.85 / 1.0 / 1.2 */
  petScale: number;
  /** 桌宠本体透明度：0.55 - 1.0 */
  petOpacity: number;
  /** 悬浮互动面板与对话气泡的液态玻璃主题 */
  panelTheme: DesktopPanelTheme;
  /** 单击桌宠行为：interact 摸头/戳戳互动，panel 单击直接展开互动卡片 */
  tapAction: DesktopTapAction;
  /** 是否开启自主冒泡对话 */
  showBubbles: boolean;
  setAutoFollowBackground: (on: boolean) => void;
  setOverlayMode: (mode: DesktopOverlayMode) => void;
  setPetScale: (scale: number) => void;
  setPetOpacity: (opacity: number) => void;
  setPanelTheme: (theme: DesktopPanelTheme) => void;
  setTapAction: (action: DesktopTapAction) => void;
  setShowBubbles: (show: boolean) => void;
  toggleGhostMode: (enabled: boolean) => Promise<void>;
  toggleEdgeRest: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<DesktopPetStatus>;
}

export const useDesktopPet = create<DesktopPetStore>()(
  persist(
    (set) => ({
      ...emptyDesktopPetStatus,
      autoFollowBackground: true,
      overlayMode: "auto",
      petScale: 1,
      petOpacity: 1,
      panelTheme: "auto",
      tapAction: "interact",
      showBubbles: true,
      setAutoFollowBackground: (on) => set({ autoFollowBackground: on }),
      setOverlayMode: (mode) => set({ overlayMode: mode }),
      setPetScale: (scale) =>
        set({ petScale: Math.max(0.8, Math.min(1.3, Math.round(scale * 100) / 100)) }),
      setPetOpacity: (opacity) =>
        set({ petOpacity: Math.max(0.55, Math.min(1, Math.round(opacity * 100) / 100)) }),
      setPanelTheme: (theme) => set({ panelTheme: theme }),
      setTapAction: (action) => set({ tapAction: action }),
      setShowBubbles: (show) => set({ showBubbles: show }),
      toggleGhostMode: async (enabled) => {
        await setDesktopPetGhostMode(enabled);
        set({ ghostMode: enabled });
      },
      toggleEdgeRest: async (enabled) => {
        await setDesktopPetEdgeRest(enabled);
        set({ edgeRest: enabled });
      },
      refresh: async () => {
        const status = await getDesktopPetStatus();
        set(status);
        const memory = useWhaleMemory.getState();
        // 同步桌面期间的喂饭、摸头与戳戳互动
        if (status.pendingFeeds > 0 || status.pendingPats > 0 || status.pendingPokes > 0) {
          useWhalePet.getState().applyDesktopCare(status.pendingFeeds, status.pendingPats);
          if (memory.hydrated) {
            const pleasure = Math.min(28, status.pendingFeeds * 6 + status.pendingPats * 8);
            const arousal = Math.min(20, status.pendingPokes * 4 + status.pendingFeeds * 3);
            if (pleasure > 0 || arousal > 0) {
              memory.applyMood({
                pleasure,
                arousal,
                reason: status.pendingFeeds > 0 ? "在桌面被投喂了团子" : "在桌面被摸了摸头",
              });
            }
            const total = status.pendingFeeds + status.pendingPats;
            if (total > 0) memory.bumpBond("interaction");
          }
          await acknowledgeDesktopCounters();
        }
        // Import the last desktop bump once when JS resumes. No AI call or quota use.
        if (status.lastImpactAt && status.lastImpactText && memory.hydrated) {
          const id = `desktop-impact-${status.lastImpactAt}`;
          if (!memory.petMessages.some((m) => m.id === id)) {
            memory.setPetMessages((prev) => [
              ...prev,
              {
                id,
                role: "assistant",
                content: status.lastImpactText,
                timestamp: status.lastImpactAt,
              },
            ]);
            memory.applyMood({ pleasure: -14, arousal: 10, reason: "在桌面不小心撞到边框了" });
          }
          await acknowledgeDesktopImpact(status.lastImpactAt);
        }
        return status;
      },
    }),
    {
      name: "dark-study-desktop-pet",
      storage: coordinatedJSONStorage("dark-study-desktop-pet"),
      partialize: (s) => ({
        autoFollowBackground: s.autoFollowBackground,
        overlayMode: s.overlayMode,
        petScale: s.petScale,
        petOpacity: s.petOpacity,
        panelTheme: s.panelTheme,
        tapAction: s.tapAction,
        showBubbles: s.showBubbles,
      }),
    },
  ),
);

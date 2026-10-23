import { create } from "zustand";

interface WhalePetState {
  /** 桌宠是否在场（仅本次运行有效，退出应用即收回） */
  visible: boolean;
  show: () => void;
  hide: () => void;
}

export const useWhalePet = create<WhalePetState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));

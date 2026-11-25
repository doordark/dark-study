import { create } from "zustand";
import { persist } from "zustand/middleware";

import { coordinatedJSONStorage } from "@/utils/storage";

/** 大肥鱼的养护状态：饱食度 / 心情 / 好感，全部 0-100 */
export interface WhaleCare {
  /** 饱食度：饿久了会没力气，也会不开心 */
  fullness: number;
  /** 心情：长时间没人理她会掉 */
  mood: number;
  /** 好感：陪她玩、喂饭会慢慢涨 */
  bond: number;
  /** 上次结算的时间戳：离开应用期间按真实时间衰减 */
  lastSeenAt: number;
}

const HOUR = 3_600_000;
const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));

const initialCare = (): WhaleCare => ({
  fullness: 82,
  mood: 88,
  bond: 40,
  lastSeenAt: Date.now(),
});

/**
 * 按真实流逝时间结算养护状态。
 * 饱食度每小时掉 2.4；心情每小时掉 1.2，饿着时掉得更快（2.4）；
 * 好感只在超过一天没见时才慢慢回落。
 */
export function decayCare(care: WhaleCare, now: number): WhaleCare {
  const hours = Math.min(Math.max((now - care.lastSeenAt) / HOUR, 0), 24 * 30);
  if (hours < 0.05) return { ...care, lastSeenAt: now };
  const fullness = clamp(care.fullness - hours * 2.4);
  const mood = clamp(care.mood - hours * (fullness < 25 ? 2.4 : 1.2));
  const bond = clamp(care.bond - (hours > 24 ? (hours - 24) * 0.6 : 0));
  return { fullness, mood, bond, lastSeenAt: now };
}

interface WhalePetState {
  /** 桌宠是否在场（仅本次运行有效，退出应用即收回） */
  visible: boolean;
  care: WhaleCare;
  /** 最近一次应用内位置归一化坐标（用于退后台时 0ms 无缝交给原生桌面桌宠） */
  lastNormX: number;
  lastNormY: number;
  lastFace: number;
  show: () => void;
  hide: () => void;
  setLastPosition: (normX: number, normY: number, face: number) => void;
  /** 心跳结算：把上次结算到现在这段时间的衰减补上 */
  tick: () => void;
  feed: () => void;
  pat: () => void;
  /** 同步桌面悬浮窗期间的喂饭与摸头次数 */
  applyDesktopCare: (feeds: number, pats: number) => void;
}

export const useWhalePet = create<WhalePetState>()(
  persist(
    (set) => ({
      visible: false,
      care: initialCare(),
      lastNormX: 0.78,
      lastNormY: 0.56,
      lastFace: 1,
      show: () =>
        set((s) => ({
          visible: true,
          care: decayCare(s.care, Date.now()),
        })),
      hide: () => set({ visible: false }),
      setLastPosition: (normX, normY, face) =>
        set({
          lastNormX: Math.max(0, Math.min(1, normX)),
          lastNormY: Math.max(0, Math.min(1, normY)),
          lastFace: face < 0 ? -1 : 1,
        }),
      tick: () => set((s) => ({ care: decayCare(s.care, Date.now()) })),
      feed: () =>
        set((s) => {
          const now = decayCare(s.care, Date.now());
          return {
            care: {
              ...now,
              fullness: clamp(now.fullness + 26),
              mood: clamp(now.mood + 6),
              bond: clamp(now.bond + 2),
            },
          };
        }),
      pat: () =>
        set((s) => {
          const now = decayCare(s.care, Date.now());
          return {
            care: {
              ...now,
              mood: clamp(now.mood + 9),
              bond: clamp(now.bond + 2.5),
            },
          };
        }),
      applyDesktopCare: (feeds, pats) =>
        set((s) => {
          if (feeds <= 0 && pats <= 0) return s;
          const now = decayCare(s.care, Date.now());
          const f = Math.min(10, Math.max(0, Math.floor(feeds)));
          const p = Math.min(15, Math.max(0, Math.floor(pats)));
          return {
            care: {
              ...now,
              fullness: clamp(now.fullness + f * 24),
              mood: clamp(now.mood + f * 5 + p * 7),
              bond: clamp(now.bond + f * 2 + p * 1.8),
            },
          };
        }),
    }),
    {
      name: "dark-study-whale-pet",
      storage: coordinatedJSONStorage("courseflow-whale-pet"),
      // 只记住养护数值；visible 不落盘，退出应用后桌宠自然收回
      partialize: (s) => ({ care: s.care }),
    },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { courseColorNames } from "@/constants/palette";
import type { CourseColor } from "@/types";
import {
  decodeScheduleShareCode,
  type SharedPeerSchedule,
} from "@/utils/scheduleShare";
import { coordinatedJSONStorage } from "@/utils/storage";

export const PEER_SCHEDULES_STORAGE_KEY = "dark-study-peer-schedules";

const PEER_COLOR_ORDER: readonly CourseColor[] = [
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "sky",
];

function pickPeerColor(existing: readonly SharedPeerSchedule[]): CourseColor {
  const counts = new Map<CourseColor, number>();
  for (const color of courseColorNames) counts.set(color, 0);
  for (const peer of existing) {
    counts.set(peer.color, (counts.get(peer.color) ?? 0) + 1);
  }
  let best = PEER_COLOR_ORDER[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const color of PEER_COLOR_ORDER) {
    const count = counts.get(color) ?? 0;
    if (count < bestCount) {
      bestCount = count;
      best = color;
    }
  }
  return best;
}

export interface PeerSchedulesState {
  peers: SharedPeerSchedule[];
  importPeerFromCode: (
    code: string,
    nicknameOverride?: string,
  ) => SharedPeerSchedule;
  removePeer: (id: string) => void;
  togglePeerActive: (id: string) => void;
  renamePeer: (id: string, nickname: string) => void;
  clearPeers: () => void;
}

export const usePeerSchedules = create<PeerSchedulesState>()(
  persist(
    (set, get) => ({
      peers: [],

      importPeerFromCode: (code, nicknameOverride) => {
        const decoded = decodeScheduleShareCode(code);
        const existing = get().peers;
        const cleanOverride = nicknameOverride?.trim().slice(0, 24);
        const finalNickname =
          cleanOverride || decoded.nickname || decoded.scheduleName || "好友";

        const peer: SharedPeerSchedule = {
          id: `peer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          nickname: finalNickname,
          color: pickPeerColor(existing),
          scheduleName: decoded.scheduleName,
          totalWeeks: decoded.totalWeeks,
          startDate: decoded.startDate,
          courses: decoded.courses,
          active: true,
          importedAt: Date.now(),
        };

        set({ peers: [...existing, peer] });
        return peer;
      },

      removePeer: (id) =>
        set((state) => ({
          peers: state.peers.filter((p) => p.id !== id),
        })),

      togglePeerActive: (id) =>
        set((state) => ({
          peers: state.peers.map((p) =>
            p.id === id ? { ...p, active: !p.active } : p,
          ),
        })),

      renamePeer: (id, nickname) => {
        const trimmed = nickname.trim().slice(0, 24);
        if (!trimmed) return;
        set((state) => ({
          peers: state.peers.map((p) =>
            p.id === id ? { ...p, nickname: trimmed } : p,
          ),
        }));
      },

      clearPeers: () => set({ peers: [] }),
    }),
    {
      name: PEER_SCHEDULES_STORAGE_KEY,
      storage: coordinatedJSONStorage(PEER_SCHEDULES_STORAGE_KEY),
      partialize: (state) => ({ peers: state.peers }),
    },
  ),
);

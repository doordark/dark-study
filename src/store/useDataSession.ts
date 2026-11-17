import { create } from 'zustand';
/** Remount local scene state after a successful restore. Never persisted. */
export const useDataSession = create<{ revision: number; restoring: boolean }>(() => ({ revision: 0, restoring: false }));

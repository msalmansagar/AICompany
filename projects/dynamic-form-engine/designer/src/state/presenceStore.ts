import { create } from 'zustand';
import type { ActiveEditor } from '@/services/presence/EditLockService';

interface PresenceStoreState {
  /** Other users currently editing the same form. Empty when the current user is alone. */
  presenceEditors: ActiveEditor[];

  setPresenceEditors: (editors: ActiveEditor[]) => void;
  resetPresenceState: () => void;
}

export const usePresenceStore = create<PresenceStoreState>((set) => ({
  presenceEditors: [],

  setPresenceEditors: (editors) => set({ presenceEditors: editors }),

  resetPresenceState: () => set({ presenceEditors: [] }),
}));

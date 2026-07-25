import { create } from 'zustand';
import { produce } from 'immer';

/** Captured at the moment a 412 is received so the dialog can show context. */
export interface ConcurrencyConflictState {
  entityLogicalName: string;
  recordId: string;
  /** The local (stale) etag that was sent in If-Match and rejected by Dataverse. */
  localEtag: string;
  conflictTimestamp: Date;
}

interface ConcurrencyStoreState {
  /** Map of recordId → current etag for every record that has been loaded via getFormWithEtag(). */
  recordEtags: Record<string, string>;
  /** Non-null when a 412 conflict is waiting for user resolution. */
  conflictState: ConcurrencyConflictState | null;

  setRecordEtag: (id: string, etag: string) => void;
  clearRecordEtag: (id: string) => void;
  setConflictState: (conflict: ConcurrencyConflictState | null) => void;
  resetConcurrencyState: () => void;
}

export const useConcurrencyStore = create<ConcurrencyStoreState>((set) => ({
  recordEtags: {},
  conflictState: null,

  setRecordEtag: (id, etag) =>
    set(
      produce((state: ConcurrencyStoreState) => {
        state.recordEtags[id] = etag;
      })
    ),

  clearRecordEtag: (id) =>
    set(
      produce((state: ConcurrencyStoreState) => {
        delete state.recordEtags[id];
      })
    ),

  setConflictState: (conflict) => set({ conflictState: conflict }),

  resetConcurrencyState: () => set({ recordEtags: {}, conflictState: null }),
}));

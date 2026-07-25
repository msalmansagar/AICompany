/**
 * Audit reliability store — DFE-ENH-001 PC-3.
 *
 * Buffers AuditEntry records that failed to write on the first attempt so that
 * the next successful save can retry them. Surfaces a passive warning flag when
 * entries are pending retry so the UI can notify the user non-intrusively.
 *
 * Failures are always non-blocking: a buffered entry never aborts or delays
 * the designer save flow.
 */

import { create } from 'zustand';
import type { AuditEntry } from '@/services/AuditPatchMapper';

interface AuditStoreState {
  /** Entries that failed on a prior write attempt and are waiting to be retried. */
  pendingAuditEntries: readonly AuditEntry[];
  /** True while there are pending entries that have not yet been retried successfully. */
  hasAuditRetryWarning: boolean;
  /** Appends failed entries to the buffer and raises the retry warning flag. */
  addFailedEntries: (entries: readonly AuditEntry[]) => void;
  /**
   * Removes and returns all pending entries so the caller can retry them.
   * Clears the buffer and the warning flag — the flag is re-raised by
   * addFailedEntries if the retry also fails.
   */
  takePendingEntries: () => readonly AuditEntry[];
  /** Hides the warning banner without discarding the pending buffer. */
  dismissAuditRetryWarning: () => void;
}

export const useAuditStore = create<AuditStoreState>((set, get) => ({
  pendingAuditEntries: [],
  hasAuditRetryWarning: false,

  addFailedEntries: (entries) =>
    set((state) => ({
      pendingAuditEntries: [...state.pendingAuditEntries, ...entries],
      hasAuditRetryWarning: true,
    })),

  takePendingEntries: () => {
    const entries = get().pendingAuditEntries;
    set({ pendingAuditEntries: [], hasAuditRetryWarning: false });
    return entries;
  },

  dismissAuditRetryWarning: () => set({ hasAuditRetryWarning: false }),
}));

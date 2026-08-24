import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Drops everything the undo stack has recorded so far.
 *
 * Loading a process writes state — and the editor's first auto-layout writes
 * more — so those land in history as if the user had done them. Undo then
 * reached back past the user's first edit and emptied the canvas (a freshly
 * opened process went 5 nodes → 2 in two presses). Call this once a load has
 * settled: from then on the first Undo is the user's first edit.
 */
export function clearUndoHistory(): void {
  useWorkflowStore.temporal.getState().clear();
}

/**
 * Clears now and again after the current work has flushed, catching the
 * layout pass a canvas runs when it mounts.
 */
export function clearUndoHistorySoon(): void {
  clearUndoHistory();
  setTimeout(clearUndoHistory, 0);
}

/** 800 ms chosen: absorbs rapid edits (<16ms keystroke gaps) while staying well under the 2-minute autosave window. */
export const WRITE_QUEUE_DEBOUNCE_MS = 800;

type WriteOperation = () => Promise<void>;

export class WriteQueue {
  private pendingOperation: WriteOperation | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  schedule(operation: WriteOperation, debounceMs = WRITE_QUEUE_DEBOUNCE_MS): void {
    this.cancelPendingTimer();
    this.pendingOperation = operation;
    this.pendingTimer = setTimeout(() => void this.flush(), debounceMs);
  }

  /** Force-flush immediately (used before navigation or beforeunload). */
  async flush(): Promise<void> {
    this.cancelPendingTimer();
    if (this.isRunning || this.pendingOperation === null) return;

    const operation = this.pendingOperation;
    this.pendingOperation = null;
    this.isRunning = true;
    try {
      await operation();
    } finally {
      this.isRunning = false;
      if (this.pendingOperation !== null) {
        await this.flush();
      }
    }
  }

  get hasPending(): boolean {
    return this.pendingOperation !== null || this.pendingTimer !== null;
  }

  private cancelPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}

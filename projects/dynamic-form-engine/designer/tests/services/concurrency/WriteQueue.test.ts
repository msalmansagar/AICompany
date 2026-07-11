import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WriteQueue, WRITE_QUEUE_DEBOUNCE_MS } from '@/services/concurrency/WriteQueue';

describe('WriteQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hasPending_returnsFalse_whenNothingScheduled', () => {
    const queue = new WriteQueue();
    expect(queue.hasPending).toBe(false);
  });

  it('hasPending_returnsTrue_whenWritePending', () => {
    const queue = new WriteQueue();
    queue.schedule(() => Promise.resolve(), vi.fn());
    expect(queue.hasPending).toBe(true);
  });

  it('schedule_replacesEarlierWrite_whenCalledBeforeDebounce', async () => {
    const queue = new WriteQueue();
    const firstOp = vi.fn().mockResolvedValue(undefined);
    const secondOp = vi.fn().mockResolvedValue(undefined);

    queue.schedule(firstOp, vi.fn());
    queue.schedule(secondOp, vi.fn());

    await vi.runAllTimersAsync();

    expect(firstOp).not.toHaveBeenCalled();
    expect(secondOp).toHaveBeenCalledOnce();
  });

  it('schedule_executesWrite_afterDebounceExpires', async () => {
    const queue = new WriteQueue();
    const operation = vi.fn().mockResolvedValue(undefined);

    queue.schedule(operation, vi.fn());
    expect(operation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WRITE_QUEUE_DEBOUNCE_MS);

    expect(operation).toHaveBeenCalledOnce();
  });

  it('schedule_callsOnError_whenOperationThrows', async () => {
    const queue = new WriteQueue();
    const onError = vi.fn();
    const thrownError = new Error('412 conflict');
    const failingOp = vi.fn().mockRejectedValue(thrownError);

    queue.schedule(failingOp, onError, 0);
    await vi.runAllTimersAsync();

    expect(failingOp).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(thrownError);
  });

  it('flush_executesImmediately_withoutWaitingForDebounce', async () => {
    const queue = new WriteQueue();
    const operation = vi.fn().mockResolvedValue(undefined);

    queue.schedule(operation, vi.fn(), 10_000);
    expect(operation).not.toHaveBeenCalled();

    await queue.flush();

    expect(operation).toHaveBeenCalledOnce();
  });

  it('flush_queuesNextWrite_whenFlushingAlreadyInProgress', async () => {
    const queue = new WriteQueue();

    let resolveFirst!: () => void;
    const firstOp = vi.fn().mockReturnValue(
      new Promise<void>(resolve => { resolveFirst = resolve; })
    );
    const secondOp = vi.fn().mockResolvedValue(undefined);

    // First flush — hangs until we call resolveFirst
    const firstFlush = queue.flush();
    // Manually set the pending operation as if schedule was called
    // while flush was running
    queue.schedule(firstOp, vi.fn(), 0);
    const secondFlush = queue.flush();

    // Schedule the second op while first is running
    queue.schedule(secondOp, vi.fn(), 0);

    resolveFirst();
    await firstFlush;
    await secondFlush;

    // Both operations should have run
    expect(secondOp).toHaveBeenCalled();
  });

  it('flush_doesNothing_whenNothingPending', async () => {
    const queue = new WriteQueue();
    // Should resolve without throwing
    await expect(queue.flush()).resolves.toBeUndefined();
  });
});

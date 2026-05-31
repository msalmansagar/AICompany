import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, CrmApiError } from '@/services/crmRetry';

vi.useFakeTimers();

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  it('withRetry_succeeds_onFirstAttempt', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    const resultPromise = withRetry(operation, 'testOp');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('withRetry_retries_onTransientFailure', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('recovered');

    const resultPromise = withRetry(operation, 'testOp');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('withRetry_throws_CrmApiError_afterThreeFailures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const resultPromise = withRetry(operation, 'testOp');
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toBeInstanceOf(CrmApiError);
    // MAX_RETRIES is 3, so total calls = initial + 3 retries = 4
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('withRetry_CrmApiError_containsOperationName', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('network error'));

    const resultPromise = withRetry(operation, 'myOperation');
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({
      name: 'CrmApiError',
      operation: 'myOperation',
    });
  });
});

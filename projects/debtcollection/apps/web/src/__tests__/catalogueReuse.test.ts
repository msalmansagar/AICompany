import { describe, expect, it, vi } from 'vitest';
import { loadActivityTypes, loadOutcomes } from '../data/configurationCatalog.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * The Case Workspace asks for the same configuration from several panels at once. One session reuses
 * a catalogue answer briefly instead of re-reading it per panel; a failure is forgotten so a retry
 * really retries; a read that must include a retired row is never shared.
 */

function countingAdapter(outcome: 'answers' | 'fails' = 'answers') {
  const calls: string[] = [];
  const adapter = {
    async retrievePage(entitySet: string) {
      calls.push(entitySet);
      if (outcome === 'fails') throw new Error('refused');
      return { items: [{ qdb_collectionactivitytypeid: 't-1', qdb_name: 'Call', qdb_isactive: true }], hasMore: false };
    },
  } as unknown as XrmCrmAdapter;
  return { adapter, calls };
}

describe('catalogue reuse', () => {
  it('reads the activity types once for many simultaneous askers on one session', async () => {
    const { adapter, calls } = countingAdapter();

    await Promise.all([loadActivityTypes(adapter), loadActivityTypes(adapter), loadActivityTypes(adapter)]);

    expect(calls).toHaveLength(1);
  });

  it('does not share answers between sessions', async () => {
    const first = countingAdapter();
    const second = countingAdapter();

    await loadActivityTypes(first.adapter);
    await loadActivityTypes(second.adapter);

    expect([first.calls.length, second.calls.length]).toEqual([1, 1]);
  });

  it('reads again when a record needs its retired type re-admitted', async () => {
    const { adapter, calls } = countingAdapter();

    await loadActivityTypes(adapter);
    await loadActivityTypes(adapter, { currentId: 't-1' });

    expect(calls).toHaveLength(2);
  });

  it('keeps each activity type\'s outcomes apart', async () => {
    const { adapter, calls } = countingAdapter();

    await Promise.all([loadOutcomes(adapter, 't-1'), loadOutcomes(adapter, 't-1'), loadOutcomes(adapter, 't-2')]);

    expect(calls).toHaveLength(2);
  });

  it('reads again once the answer is a minute old', async () => {
    const { adapter, calls } = countingAdapter();
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);

    await loadActivityTypes(adapter);
    clock.mockReturnValue(start + 59_000);
    await loadActivityTypes(adapter);
    clock.mockReturnValue(start + 61_000);
    await loadActivityTypes(adapter);
    clock.mockRestore();

    expect(calls).toHaveLength(2);
  });

  it('forgets a failed read, so a retry asks again', async () => {
    const { adapter, calls } = countingAdapter('fails');

    await loadActivityTypes(adapter).catch(() => undefined);
    await loadActivityTypes(adapter).catch(() => undefined);

    expect(calls).toHaveLength(2);
  });
});

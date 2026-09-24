import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { WorkoutQueueView } from '../views/workoutQueueView.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Moving between Workout entries must land on each entry's own process.
 *
 * Found in browser QA: from Legal Hand-off to Disputes, the router keeps the same component in the
 * same place, so a bucket read once from `initialBucket` stayed on Legal — the Disputes screen
 * listed Legal work under a Disputes heading.
 */

const fakeXrm = {
  WebApi: {
    retrieveRecord: async () => ({}),
    retrieveMultipleRecords: async () => ({ entities: [] }),
  },
} as unknown as XrmLike;

function renderView(viewId: 'disputes' | 'legal' | 'claims') {
  const adapter = new XrmCrmAdapter(fakeXrm);
  return (
    <CrmSessionProvider value={{ adapter, context: { userId: 'u-1' } } as never}>
      <WorkoutQueueView viewId={viewId} />
    </CrmSessionProvider>
  );
}

const activeBucket = () =>
  document.querySelector('[data-testid^="bucket-"].btn.primary')?.getAttribute('data-testid');

afterEach(cleanup);

describe('moving between Workout entries', () => {
  it.each([
    ['disputes', 'bucket-Disputes'],
    ['claims', 'bucket-DeceasedReview'],
  ] as const)('opens %s on its own bucket after Legal Hand-off', async (next, expected) => {
    const { rerender } = render(renderView('legal'));
    await waitFor(() => expect(activeBucket()).toBe('bucket-Legal'));

    rerender(renderView(next));

    await waitFor(() => expect(activeBucket()).toBe(expected));
    expect(screen.getByTestId(`workout-queue-${next}`)).toBeTruthy();
  });
});

import type { OperationalBucket } from '@dcp/domain';
import { InfoBanner } from '../components/primitives.js';
import { MyWorkView } from './MyWorkView.js';

/**
 * A Workout navigation entry, delivered as the operational queue opened on its own process (WP6).
 *
 * Phase 9 builds no separate Legal, Disputes or Deceased workspace: the queue already lists that
 * work across every case, from the same records the case cards read, and the case's Workout & Legal
 * tab says what each process supports. A second screen for each would be a second copy of both.
 * The sentence above the queue says what is and is not possible here, and names no control that
 * does not exist.
 */
export type WorkoutQueueId = 'disputes' | 'legal' | 'claims';

export const OPENING_BUCKET: Readonly<Record<WorkoutQueueId, OperationalBucket>> = {
  disputes: 'Disputes',
  legal: 'Legal',
  claims: 'DeceasedReview',
};

export const WHAT_IS_POSSIBLE: Readonly<Record<WorkoutQueueId, string>> = {
  disputes: 'Collection disputes across every case. A dispute is recorded from a case with Log action; '
    + 'it changes nothing about collection. Formal complaints are raised by Case Management, and are '
    + 'listed under Complaints.',
  legal: 'Legal recommendations across every case, with the Legal request each has raised. No '
    + 'recommendation is handed to Legal from the workspace: QDB has not yet set what qualifies one.',
  claims: 'Deceased reviews across every case. A review records that someone is checking the Qatar '
    + 'Central Bank indication, and nothing more. Insurance claims are not offered, because no claims '
    + 'process was found to work with.',
};

export function WorkoutQueueView({ viewId, onOpenCase }: {
  viewId: WorkoutQueueId;
  onOpenCase?: (id: string) => void;
}) {
  return (
    <div data-testid={`workout-queue-${viewId}`}>
      <InfoBanner icon="info">{WHAT_IS_POSSIBLE[viewId]}</InfoBanner>
      {/*
        * Keyed by view: the router keeps this component in place when one Workout entry follows
        * another, and without a fresh queue the bucket chosen by the first would survive into the
        * second — Legal work listed under a Disputes heading.
        */}
      <MyWorkView
        key={viewId}
        initialBucket={OPENING_BUCKET[viewId]}
        {...(onOpenCase ? { onOpenCase } : {})}
      />
    </div>
  );
}

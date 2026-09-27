/**
 * Delinquency episode rules — what an incoming MIS observation means for the facility's case.
 *
 * One active Collection Case per facility per delinquency episode. A cure closes the episode; a later
 * re-delinquency normally opens a new one. The only tunable is how a closed episode may be reopened,
 * and that is configuration, not a constant here.
 */

import { z } from 'zod';
import { type CaseSummary } from './collectionCase.js';
import { type MisDelinquencyRecord, isDelinquent, hasPositionChanged } from './misObservation.js';
import { isActiveCaseStatus } from './caseLifecycle.js';

/**
 * How a re-delinquency after closure is treated. With no window configured, the normal rule applies
 * unconditionally: a new episode. A window turns closures inside it into a reopening of the same
 * episode (Closed → Reopened), which is the approved matrix's only route back into a closed case.
 */
export const EpisodePolicySchema = z.object({
  reopenWindowDays: z.number().int().positive().optional(),
});
export type EpisodePolicy = z.infer<typeof EpisodePolicySchema>;

export type EpisodeAction =
  /** Delinquent, no active case: open episode n+1. */
  | { kind: 'Create'; episodeNumber: number }
  /** Delinquent, active case exists: refresh the cached position; note whether it moved. */
  | { kind: 'Update'; caseId: string; changed: boolean }
  /** Delinquent, closed case inside the reopen window: same episode continues. */
  | { kind: 'Reopen'; caseId: string; episodeNumber: number }
  /** Not delinquent, active case exists: the episode is curing. */
  | { kind: 'Cure'; caseId: string }
  /** Not delinquent, nothing open: nothing to do. */
  | { kind: 'Ignore' };

export interface EpisodeContext {
  record: MisDelinquencyRecord;
  /** The facility's case with `statecode = 0`, if any. There can be at most one. */
  activeCase?: CaseSummary;
  /** The most recently closed case for the facility, if any. */
  latestClosedCase?: CaseSummary;
  policy: EpisodePolicy;
  /** "Now" for the reopen-window comparison; injected so the rule is testable. */
  asOf: string;
}

export function decideEpisodeAction(context: EpisodeContext): EpisodeAction {
  const { record, activeCase, latestClosedCase, policy } = context;

  if (activeCase && !isActiveCaseStatus(activeCase.status)) {
    throw new Error(`activeCase ${activeCase.id} is in terminal status ${activeCase.status}; the caller must pass only open cases`);
  }

  if (!isDelinquent(record)) {
    return activeCase ? { kind: 'Cure', caseId: activeCase.id } : { kind: 'Ignore' };
  }

  if (activeCase) {
    return { kind: 'Update', caseId: activeCase.id, changed: hasPositionChanged(activeCase.cachedPosition, record) };
  }

  if (latestClosedCase && isInsideReopenWindow(latestClosedCase, policy, context.asOf)) {
    return { kind: 'Reopen', caseId: latestClosedCase.id, episodeNumber: latestClosedCase.episodeNumber };
  }

  return { kind: 'Create', episodeNumber: (latestClosedCase?.episodeNumber ?? 0) + 1 };
}

function isInsideReopenWindow(closedCase: CaseSummary, policy: EpisodePolicy, asOf: string): boolean {
  if (policy.reopenWindowDays === undefined || closedCase.closedDate === undefined) return false;
  const closedAt = Date.parse(closedCase.closedDate);
  const now = Date.parse(asOf);
  if (Number.isNaN(closedAt) || Number.isNaN(now)) return false;
  const elapsedDays = (now - closedAt) / 86_400_000;
  return elapsedDays >= 0 && elapsedDays <= policy.reopenWindowDays;
}

import { z } from 'zod';

/**
 * Collection Eligibility / Grace evaluation (ADR-DCP-11).
 *
 * A MIS delinquency record is **not** a Collection Case. After identity and facility resolution, a
 * configurable evaluation decides what happens. The evaluation itself is a Rule Engine ruleset named by
 * `qdb_platformconfiguration.qdb_eligibilityrulesetcode` — this module carries only the contract.
 *
 * No threshold appears here. `arrears < 1 instalment`, `DPD < N`, bucket boundaries and segmentation
 * cut-offs are ruleset configuration and remain business policy; HL and BFD may differ materially on
 * the same build.
 */

export const EligibilityOutcomeSchema = z.enum([
  /** Admitted, no active episode for this facility — create one. */
  'EligibleCreateCase',
  /** Admitted, an active episode exists — update it. */
  'ExistingEpisodeUpdate',
  /** Delinquent but not yet worth a case (e.g. inside a configured grace). Observed, not actioned. */
  'GraceMonitor',
  /** Excluded by policy or under special handling. */
  'ExcludedSpecialHandling',
  /** The customer could not be resolved safely. */
  'IdentityException',
  /** The facility/account could not be resolved safely. */
  'FacilityException',
]);
export type EligibilityOutcome = z.infer<typeof EligibilityOutcomeSchema>;

/** Outcomes that must never produce or mutate a Collection Case. */
export const NON_CASE_OUTCOMES = [
  'GraceMonitor',
  'ExcludedSpecialHandling',
  'IdentityException',
  'FacilityException',
] as const satisfies readonly EligibilityOutcome[];

export function createsOrUpdatesCase(outcome: EligibilityOutcome): boolean {
  return outcome === 'EligibleCreateCase' || outcome === 'ExistingEpisodeUpdate';
}

/**
 * The recorded decision. Persisted on `qdb_delinquencysnapshot` so an observation that produced no
 * case still has auditable history, and so a past decision stays explainable after the ruleset changes
 * — which is why the ruleset code *and version* are part of the record.
 */
export const EligibilityDecisionSchema = z.object({
  outcome: EligibilityOutcomeSchema,
  /** Human-readable reason from the ruleset. Not a code DCP interprets. */
  reason: z.string().max(500).optional(),
  rulesetCode: z.string().max(100),
  rulesetVersion: z.string().max(50),
  evaluatedOn: z.string(),
});
export type EligibilityDecision = z.infer<typeof EligibilityDecisionSchema>;

/**
 * Contact Hold / Special Handling decision.
 *
 * Evaluated **server-side** for every send — user-initiated and system-initiated alike — so neither the
 * React workspace nor a background job can bypass it. Hiding a button is never the control.
 *
 * What triggers a hold is configuration: whether a deceased indicator alone establishes one is business
 * and compliance policy (`TBD — Requires QDB Confirmation`) and is not encoded anywhere in this package.
 */
export const ContactHoldDecisionSchema = z.object({
  hold: z.boolean(),
  reason: z.string().max(500).optional(),
  rulesetCode: z.string().max(100),
  rulesetVersion: z.string().max(50),
  evaluatedOn: z.string(),
});
export type ContactHoldDecision = z.infer<typeof ContactHoldDecisionSchema>;

/** Which snapshot observations are persisted. Deployment default is TBD — see MISIntegration.md §7.2. */
export const SnapshotPolicySchema = z.enum(['AllReceived', 'EligibleOnly', 'ChangedOnly']);
export type SnapshotPolicy = z.infer<typeof SnapshotPolicySchema>;

/**
 * Decides whether an observation is persisted under a given policy.
 * `changed` is supplied by the caller (the sync compares against the last stored observation).
 */
export function shouldPersistSnapshot(
  policy: SnapshotPolicy,
  outcome: EligibilityOutcome,
  changed: boolean,
): boolean {
  if (policy === 'AllReceived') return true;
  if (policy === 'ChangedOnly') return changed;
  return createsOrUpdatesCase(outcome);
}

// ── Evaluation port (Phase 2) ────────────────────────────────────────────────

import type { MisDelinquencyRecord } from './misObservation.js';
import type { ResolvedCustomer } from './customerResolution.js';

/**
 * Everything the configured ruleset may consider. No threshold appears here or anywhere in
 * application source: the ruleset decides, this type only carries the facts to it.
 */
export interface EligibilityInput {
  record: MisDelinquencyRecord;
  /** Present when identity resolution succeeded; absent means the ruleset sees an unresolved customer. */
  customer?: ResolvedCustomer;
  /** The facility's open case, if one exists — an existing episode is a criterion the ruleset may use. */
  activeCase?: { id: string; status: string; episodeNumber: number };
  rulesetCode: string;
}

/**
 * The port through which Collection Eligibility / Grace is evaluated (ADR-DCP-11). The production
 * implementation calls the Rule Engine by name — a Custom API on cloud, a Process Action on-premises —
 * through `ICrmAdapter.execute`. A missing or empty ruleset must fail closed and loud, never default.
 */
export interface IEligibilityEvaluator {
  evaluate(input: EligibilityInput, context: { correlationId?: string }): Promise<EligibilityDecision>;
}

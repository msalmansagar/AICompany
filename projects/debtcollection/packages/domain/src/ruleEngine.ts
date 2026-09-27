/**
 * The Rule Engine seam.
 *
 * QDB already owns a Rule Engine, and the Master Prompt forbids building another. Every configurable
 * Collection decision — is this delinquency worth a case, which strategy applies, may we contact this
 * customer — is asked of it through this facade and answered by a versioned ruleset.
 *
 * Two properties are load-bearing and are enforced by the implementations, not by convention:
 *
 *   • **No threshold appears on this side of the seam.** The facade carries facts in and a decision
 *     out. A DPD boundary, an arrears floor, an exposure band or a grace period lives in the ruleset,
 *     where a business user can see and version it.
 *   • **It fails closed.** A missing ruleset code, an empty response, or an answer outside the
 *     approved vocabulary is an error that stops the work. It is never a default, never a silent
 *     skip, and never a guess — a wrong automatic decision about a customer's debt is worse than a
 *     refusal that someone has to look at.
 *
 * On cloud the operations are Custom APIs; on-premises they are Process Actions. Both are invoked by
 * name through `ICrmAdapter.execute`, so the Collection services do not know which platform they are on.
 */

import { z } from 'zod';
import { EligibilityDecisionSchema, type EligibilityDecision } from './eligibility.js';
import type { MisDelinquencyRecord } from './misObservation.js';
import type { ResolvedCustomer } from './customerResolution.js';

/** Provenance every decision carries, so "why did this happen in July?" is answerable. */
export const RulesetProvenanceSchema = z.object({
  rulesetCode: z.string().min(1).max(100),
  rulesetVersion: z.string().min(1).max(50),
  evaluatedOn: z.string(),
});
export type RulesetProvenance = z.infer<typeof RulesetProvenanceSchema>;

// ── Collection Eligibility (ADR-DCP-11) ──────────────────────────────────────

/** Facts offered to the eligibility ruleset. Nothing is pre-judged; the ruleset decides. */
export interface EligibilityInput {
  record: MisDelinquencyRecord;
  /** Present when identity resolution succeeded; absent means the ruleset sees an unresolved customer. */
  customer?: ResolvedCustomer;
  /** The facility's open case, if any — an existing episode is a criterion the ruleset may use. */
  activeCase?: { id: string; status: string; episodeNumber: number };
  rulesetCode: string;
}

// ── Collection Strategy ──────────────────────────────────────────────────────

/**
 * What the strategy ruleset returns: the code of the strategy that should treat this case, or none.
 *
 * It returns a *code*, not a record: the strategy's own definition — its actions, its priority, its
 * effective dates — is configuration data the service resolves afterwards. Keeping the two apart is
 * what stops the ruleset from having to know the schema, and stops the schema from having to encode
 * decisions.
 */
export const StrategySelectionSchema = z.object({
  /** Codes the ruleset considers applicable, most specific first. Empty means "no strategy applies". */
  strategyCodes: z.array(z.string().min(1)).default([]),
  reason: z.string().max(500).optional(),
}).and(RulesetProvenanceSchema);
export type StrategySelection = z.infer<typeof StrategySelectionSchema>;

/** Facts offered to the strategy ruleset. */
export interface StrategyInput {
  /** The case being treated, with its cached MIS position — the ruleset reads what it needs. */
  case: {
    id?: string;
    facilityNumber: string;
    sourceSystem: string;
    status: string;
    episodeNumber: number;
    dpd?: number;
    arrearBucket?: string;
    totalArrears?: number;
    loanBalance?: number;
    installmentAmount?: number;
    organizationCode: string;
  };
  customer?: { entity: string; id: string; businessId: string };
  rulesetCode: string;
}

// ── Contact Hold ─────────────────────────────────────────────────────────────

/**
 * Facts offered to the contact-hold ruleset.
 *
 * The authoritative source of a hold is QDB's to name (KI-44), so this carries identity and the
 * channel being attempted and nothing else. In particular it does not carry, and must not grow, a
 * "deceased" flag that the platform has decided means a hold: whether a QCB deceased indicator alone
 * establishes one is a business rule for the ruleset, not a field this contract asserts.
 */
export interface ContactHoldInput {
  customer: { entity: string; id: string; businessId: string };
  /** The channel the caller is about to use, where a send is being authorised. */
  channel?: string;
  caseId?: string;
  facilityNumber?: string;
  sourceSystem?: string;
  rulesetCode: string;
}

export const ContactHoldDecisionSchema = z.object({
  hold: z.boolean(),
  reason: z.string().max(500).optional(),
}).and(RulesetProvenanceSchema);
export type ContactHoldEvaluation = z.infer<typeof ContactHoldDecisionSchema>;

// ── The facade ───────────────────────────────────────────────────────────────

/** Raised when a ruleset is unreachable, unconfigured, or answers outside its contract. */
export class RuleEngineError extends Error {
  constructor(message: string, readonly rulesetCode?: string) {
    super(message);
    this.name = 'RuleEngineError';
  }
}

/**
 * Every configurable Collection decision, in one place. Implementations call the QDB Rule Engine;
 * tests use a deterministic double. Nothing else may decide these questions.
 */
export interface IRuleEngine {
  /** Should this MIS delinquency become, or update, a Collection Case? (ADR-DCP-11) */
  evaluateEligibility(input: EligibilityInput, context?: { correlationId?: string }): Promise<EligibilityDecision>;

  /** Which Collection Strategy should treat this case? */
  selectStrategy(input: StrategyInput, context?: { correlationId?: string }): Promise<StrategySelection>;

  /** May this customer be contacted? Evaluated server-side before any send (KI-44). */
  evaluateContactHold(input: ContactHoldInput, context?: { correlationId?: string }): Promise<ContactHoldEvaluation>;
}

/** The eligibility half of the facade, for callers that need nothing else. */
export interface IEligibilityEvaluator {
  evaluate(input: EligibilityInput, context?: { correlationId?: string }): Promise<EligibilityDecision>;
}

export { EligibilityDecisionSchema };

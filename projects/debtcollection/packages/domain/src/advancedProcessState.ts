import { concludability } from './activityOperations.js';

/**
 * What an officer can actually do with each advanced collection process, stated once (WP6).
 *
 * Phase 9 found most of this work either delivered, blocked on a QDB decision, or parked — and an
 * officer looking at the case cannot tell those apart from the cards alone. This matrix says it
 * per aspect, in one vocabulary, and **derives** it: the aspects that depend on configuration follow
 * the live outcome catalogue, so the day QDB configures outcomes the matrix changes without an edit.
 *
 * It holds no process behaviour and offers no action. It is a statement of capability, and it must
 * never be written to look more finished than the product is.
 */

export type ProcessCapability =
  /** An officer can do this now, in the workspace. */
  | 'Actionable'
  /** Another team owns it; the workspace shows it as they record it. */
  | 'ReadOnly'
  /** Built, and waiting on configuration QDB has not supplied. */
  | 'ConfigurationDependent'
  /** Waiting on a QDB business or security decision. */
  | 'Blocked'
  /** No authoritative process exists to integrate with. */
  | 'Deferred'
  /** Stopped by QDB; nothing is being built. */
  | 'Parked'
  /** The configuration could not be read, so no claim is made either way. */
  | 'NotKnown';

export type AdvancedProcess =
  | 'Legal' | 'Deceased' | 'Dispute' | 'Complaint' | 'InsuranceClaims' | 'Restructuring' | 'FieldVisit';

export interface ProcessAspect {
  id: string;
  process: AdvancedProcess;
  /** What the aspect is, in an officer's words. */
  aspect: string;
  capability: ProcessCapability;
  explanation: string;
}

/** The facts the matrix is derived from. Nothing else moves it. */
export interface AdvancedProcessEvidence {
  /** Configured outcomes per type; `undefined` where the catalogue could not be read. */
  outcomeCounts: { legal?: number | undefined; deceased?: number | undefined; dispute?: number | undefined };
  /** Whether QDB has supplied a complete Legal qualification rule. */
  legalQualificationConfigured: boolean;
}

const NOT_KNOWN = 'The configuration for this could not be read just now, so nothing is claimed about it.';
const CONCLUDED_WITH_OUTCOME = 'An officer concludes it by recording one of its configured outcomes.';

export function describeAdvancedProcesses(evidence: AdvancedProcessEvidence): readonly ProcessAspect[] {
  return [
    ...legalAspects(evidence),
    ...deceasedAspects(evidence),
    ...disputeAspects(evidence),
    ...complaintAspects(),
    ...deferredAndParked(),
  ];
}

/**
 * Concluding work of a type follows its outcome catalogue and nothing else — the same rule the
 * Complete dialog applies, so the matrix and the dialog cannot disagree.
 */
function conclusionAspect(
  id: string, process: AdvancedProcess, outcomeCount: number | undefined,
): ProcessAspect {
  const base = { id, process, aspect: 'Conclude' };
  if (outcomeCount === undefined) return { ...base, capability: 'NotKnown', explanation: NOT_KNOWN };
  const availability = concludability(outcomeCount);
  return availability.available
    ? { ...base, capability: 'Actionable', explanation: CONCLUDED_WITH_OUTCOME }
    : {
      ...base,
      capability: 'ConfigurationDependent',
      explanation: `${availability.reason} It stays open until QDB configures what concluding one means.`,
    };
}

function legalAspects(evidence: AdvancedProcessEvidence): readonly ProcessAspect[] {
  return [
    {
      id: 'legal-record', process: 'Legal', aspect: 'Record a Legal recommendation',
      capability: 'Actionable', explanation: 'Logged from the Actions tab with Log action.',
    },
    legalHandoffAspect(evidence.legalQualificationConfigured),
    {
      id: 'legal-follow', process: 'Legal', aspect: 'Follow the Legal request',
      capability: 'ReadOnly',
      explanation: 'Legal owns the request and its stages; its status is shown as Legal records it.',
    },
    conclusionAspect('legal-conclude', 'Legal', evidence.outcomeCounts.legal),
  ];
}

/**
 * A qualification rule would settle the decision, not create a button — no officer hand-off exists
 * in the product. So the best this aspect can become is configuration-dependent, never Actionable.
 */
function legalHandoffAspect(qualificationConfigured: boolean): ProcessAspect {
  const base = { id: 'legal-handoff', process: 'Legal' as const, aspect: 'Hand off to Legal' };
  return qualificationConfigured
    ? {
      ...base, capability: 'ConfigurationDependent',
      explanation: 'A qualification rule exists, but handing off from the workspace has not been enabled.',
    }
    : {
      ...base, capability: 'Blocked',
      explanation: 'QDB has not yet set what qualifies a recommendation for litigation, so none is handed off.',
    };
}

function deceasedAspects(evidence: AdvancedProcessEvidence): readonly ProcessAspect[] {
  return [
    {
      id: 'deceased-review', process: 'Deceased', aspect: 'Record a deceased review',
      capability: 'Actionable',
      explanation: 'Where the Qatar Central Bank indication is present, recorded from the review card. '
        + 'It records that someone is checking the indication, and nothing more.',
    },
    conclusionAspect('deceased-conclude', 'Deceased', evidence.outcomeCounts.deceased),
    {
      id: 'deceased-treatment', process: 'Deceased', aspect: 'Change collection for the indication',
      capability: 'Blocked',
      explanation: 'There is no agreed handling rule, so collection, messages and legal action are unchanged.',
    },
  ];
}

function disputeAspects(evidence: AdvancedProcessEvidence): readonly ProcessAspect[] {
  return [
    {
      id: 'dispute-record', process: 'Dispute', aspect: 'Record a collection dispute',
      capability: 'Actionable', explanation: 'Logged from the Actions tab with Log action.',
    },
    conclusionAspect('dispute-conclude', 'Dispute', evidence.outcomeCounts.dispute),
    {
      id: 'dispute-effect', process: 'Dispute', aspect: 'Pause or change collection',
      capability: 'Blocked',
      explanation: 'No QDB policy gives a dispute any effect, so recording one changes nothing about collection.',
    },
  ];
}

function complaintAspects(): readonly ProcessAspect[] {
  return [
    {
      id: 'complaint-follow', process: 'Complaint', aspect: 'Follow a complaint',
      capability: 'ReadOnly',
      explanation: 'Case Management owns complaints; each is shown with its own number and status.',
    },
    {
      id: 'complaint-raise', process: 'Complaint', aspect: 'Raise a formal complaint',
      capability: 'Blocked',
      explanation: 'Raising one from the workspace needs security QDB has not granted; Case Management raises them.',
    },
  ];
}

function deferredAndParked(): readonly ProcessAspect[] {
  return [
    {
      id: 'insurance-claims', process: 'InsuranceClaims', aspect: 'Insurance claims',
      capability: 'Deferred',
      explanation: 'No credit-life or mortgage-protection claims process was found, so none is offered.',
    },
    {
      id: 'restructuring', process: 'Restructuring', aspect: 'Restructuring and workout',
      capability: 'Parked', explanation: 'Parked by QDB. Nothing further is being built until QDB resumes it.',
    },
    {
      id: 'field-visit', process: 'FieldVisit', aspect: 'Field visits',
      capability: 'Parked',
      explanation: 'Parked by QDB. A visit can still be logged as an action; nothing further is being built.',
    },
  ];
}

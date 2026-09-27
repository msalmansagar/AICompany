import { isQualificationConfigured, type AdvancedProcessEvidence } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { findConcernTypeId } from './caseConcerns.js';
import { findLegalTypeId, LEGAL_QUALIFICATION_POLICY } from './caseLegalTraces.js';
import { findDeceasedTypeId } from './deceasedQueries.js';
import { useActivityTypeId, useOutcomeCount } from './useConcludability.js';

/**
 * The facts the capability matrix is derived from, read from the same places the cards read them.
 *
 * Each type is resolved by code and its catalogue counted through the hooks the cards already use,
 * so the matrix and a card can never report different answers to one configuration question.
 */
export function useAdvancedProcessEvidence(adapter: XrmCrmAdapter): AdvancedProcessEvidence {
  const legal = useOutcomeCount(adapter, useActivityTypeId(adapter, findLegalTypeId));
  const deceased = useOutcomeCount(adapter, useActivityTypeId(adapter, findDeceasedTypeId));
  const dispute = useOutcomeCount(adapter, useActivityTypeId(adapter, findConcernTypeId));

  return {
    outcomeCounts: { legal, deceased, dispute },
    legalQualificationConfigured: isQualificationConfigured(LEGAL_QUALIFICATION_POLICY),
  };
}

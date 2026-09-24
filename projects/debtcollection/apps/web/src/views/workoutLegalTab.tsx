import type { CaseDetail } from '../data/caseQueries.js';
import { AdvancedProcessPanel } from './advancedProcessPanel.js';
import { CaseConcerns } from './concernsCard.js';
import { CaseDeceasedReview } from './deceasedReviewCard.js';
import { CaseLegalTrace } from './legalTraceCard.js';

/**
 * The approved *Workout & Legal* tab, delivered in Phase 9 (WP6).
 *
 * The capability matrix comes first, so the tab is never empty and never implies more than exists.
 * Below it, the case's own Legal, dispute, complaint and deceased-review records — each card shows
 * itself only where the case has something for it. Restructuring is parked by QDB, so its only
 * presence here is a row in the matrix saying so.
 */
export function WorkoutLegalTab({ detail }: { detail: CaseDetail }) {
  return (
    <>
      <AdvancedProcessPanel />
      <CaseLegalTrace
        caseId={detail.id}
        {...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {})}
        customer={legalCustomer(detail)}
      />
      <CaseConcerns caseId={detail.id} />
      <CaseDeceasedReview caseId={detail.id} />
    </>
  );
}

/** Only an account or a contact is a customer Legal can be asked about (KI-108). */
function legalCustomer(detail: CaseDetail): { table?: 'account' | 'contact'; id?: string } {
  return {
    ...(detail.customerTable === 'account' || detail.customerTable === 'contact'
      ? { table: detail.customerTable } : {}),
    ...(detail.customerId !== undefined ? { id: detail.customerId } : {}),
  };
}

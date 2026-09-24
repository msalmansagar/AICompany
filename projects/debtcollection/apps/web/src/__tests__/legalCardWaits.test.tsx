import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { explainLegalWait } from '@dcp/domain';
import { CaseLegalTrace } from '../views/legalTraceCard.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * WP4 — what a blocked Legal Recommendation waits on, said on the card, and nothing to press.
 *
 * On this organisation no qualification rule exists (KI-109), so every unlinked recommendation is
 * blocked; a case whose customer is a contact cannot even resolve to the account Legal needs
 * (KI-108). The card must say which, once per reason, and must never offer a hand-off.
 */

const WAIT = 5000;
const CASE_ID = 'case-1';
const TYPE_ID = 'type-legal';
const ACCOUNT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const recommendation = (id: string) => ({
  activityid: id,
  subject: `Recommendation ${id}`,
  statecode: 0,
  _qdb_activitytypeid_value: TYPE_ID,
  _qdb_collectioncaseid_value: CASE_ID,
  createdon: '2026-09-23T00:00:00Z',
});

/** A platform holding one case with two open, unlinked Legal Recommendations. */
function platform(): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string) => {
        if (logicalName === 'qdb_collectionactivitytype') {
          return {
            entities: [{
              qdb_collectionactivitytypeid: TYPE_ID, qdb_name: 'Legal',
              qdb_code: 'P6-LEGALREC', qdb_isactive: true,
            }],
          };
        }
        if (logicalName === 'qdb_collectionactivity') {
          return { entities: [recommendation('rec-1'), recommendation('rec-2')] };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

function renderCard(customer: { table: 'account' | 'contact'; id: string }) {
  const adapter = new XrmCrmAdapter(platform());
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseLegalTrace caseId={CASE_ID} customer={customer} />
    </CrmSessionProvider>,
  );
}

afterEach(cleanup);

describe('a recommendation with no qualification rule', () => {
  it('says what it waits on', async () => {
    renderCard({ table: 'account', id: ACCOUNT });

    const wait = await screen.findByTestId('legal-wait-QualificationPending', {}, { timeout: WAIT });

    expect(wait.textContent).toContain(explainLegalWait('QualificationPending'));
  });

  it('says it once, however many recommendations share the reason', async () => {
    renderCard({ table: 'account', id: ACCOUNT });

    await screen.findByTestId('legal-wait-QualificationPending', {}, { timeout: WAIT });

    expect(screen.getAllByTestId(/^legal-wait-/)).toHaveLength(1);
  });
});

/**
 * Qualification is decided before the customer, so on an organisation with no rule a contact's
 * recommendation waits on the rule too. The card must not blame the customer for a wait the rule
 * causes; the customer sentence is proved in the domain, where a configured policy can reach it.
 */
describe('a recommendation whose customer is a contact', () => {
  it('still waits on the qualification rule, which is decided first', async () => {
    renderCard({ table: 'contact', id: CONTACT });

    await screen.findByTestId('legal-wait-QualificationPending', {}, { timeout: WAIT });

    expect(screen.queryByTestId('legal-wait-CustomerResolutionRequired')).toBeNull();
  });
});

/**
 * The fail-closed boundary, asserted on the rendered card rather than on intent. A hand-off may
 * not be offered while QDB has set no qualification rule, and nothing else on this card is an
 * action either.
 */
describe('the Legal card', () => {
  it.each([
    ['an account', { table: 'account' as const, id: ACCOUNT }],
    ['a contact', { table: 'contact' as const, id: CONTACT }],
  ])('offers no control of any kind for %s', async (_label, customer) => {
    renderCard(customer);

    const card = await screen.findByTestId('case-legal', {}, { timeout: WAIT });

    expect(card.closest('.section-card')?.querySelectorAll('button, a[href], [role="button"]')).toHaveLength(0);
  });
});

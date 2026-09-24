import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CaseConcerns } from '../views/concernsCard.js';
import { CaseLegalTrace } from '../views/legalTraceCard.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * WP8 — a case card that holds only its most recent page says so.
 *
 * Both advanced-process cards read one page of the case's activities. They used to discard the
 * platform's "there is more" signal, so a case with more than a page of Legal or dispute work
 * showed the first page as if it were everything.
 */

const WAIT = 5000;
const CASE_ID = 'case-1';
const NEXT_LINK = 'https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_collectionactivities?$skiptoken=next';

/** The page size each activity read asked the platform for, in the order asked. */
let requestedPageSizes: (number | undefined)[] = [];

function platform(typeCode: 'P6-LEGALREC' | 'P6-DISPUTE', isMore: boolean): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string, _options?: string, maxPageSize?: number) => {
        if (logicalName === 'qdb_collectionactivitytype') {
          return {
            entities: [{
              qdb_collectionactivitytypeid: 'type-1', qdb_name: typeCode, qdb_code: typeCode, qdb_isactive: true,
            }],
          };
        }
        if (logicalName === 'qdb_collectionactivity') {
          requestedPageSizes.push(maxPageSize);
          return {
            entities: [{
              activityid: 'activity-1', subject: 'Latest', statecode: 0,
              _qdb_activitytypeid_value: 'type-1', _qdb_collectioncaseid_value: CASE_ID,
              createdon: '2026-09-23T00:00:00Z',
            }],
            ...(isMore ? { nextLink: NEXT_LINK } : {}),
          };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

/** The Concerns card also reads the Complaint case type over the transport; unavailable here. */
const NO_METADATA = { get: async () => ({ status: 404, body: undefined }) };

function renderLegal(isMore: boolean) {
  const adapter = new XrmCrmAdapter(platform('P6-LEGALREC', isMore));
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseLegalTrace caseId={CASE_ID} />
    </CrmSessionProvider>,
  );
}

function renderConcerns(isMore: boolean) {
  const adapter = new XrmCrmAdapter(platform('P6-DISPUTE', isMore), undefined, NO_METADATA as never);
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseConcerns caseId={CASE_ID} />
    </CrmSessionProvider>,
  );
}

afterEach(() => { cleanup(); requestedPageSizes = []; });

/** The bound itself, not only the notice: each card asks the platform for one page of 100. */
describe('the read behind each card', () => {
  it.each([['Legal', renderLegal, 'case-legal'], ['disputes', renderConcerns, 'case-disputes']] as const)(
    'asks the platform for at most 100 rows — %s', async (_name, renderCard, testId) => {
      renderCard(false);

      await screen.findByTestId(testId, {}, { timeout: WAIT });

      expect(requestedPageSizes).toEqual([100]);
    });
});

describe('the Legal card', () => {
  it('says when the case holds more than it shows, and where the rest are', async () => {
    renderLegal(true);

    const notice = await screen.findByTestId('legal-more', {}, { timeout: WAIT });

    expect(notice.textContent).toContain('Actions tab');
  });

  /** Asserted once the rows have rendered, so the absence is not an early look. */
  it('says nothing when it shows everything', async () => {
    renderLegal(false);

    await screen.findByTestId('case-legal', {}, { timeout: WAIT });

    expect(screen.queryByTestId('legal-more')).toBeNull();
  });
});

describe('the disputes and complaints cards', () => {
  it('say when the case holds more than they show', async () => {
    renderConcerns(true);

    const notice = await screen.findByTestId('concerns-more', {}, { timeout: WAIT });

    expect(notice.textContent).toContain('Actions tab');
  });

  it('say nothing when they show everything', async () => {
    renderConcerns(false);

    await screen.findByTestId('case-disputes', {}, { timeout: WAIT });

    expect(screen.queryByTestId('concerns-more')).toBeNull();
  });
});

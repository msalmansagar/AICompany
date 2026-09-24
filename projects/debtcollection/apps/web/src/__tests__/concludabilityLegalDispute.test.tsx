import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NO_OUTCOMES_CONFIGURED } from '@dcp/domain';
import { CaseConcerns } from '../views/concernsCard.js';
import { CaseLegalTrace } from '../views/legalTraceCard.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * The conclusion dependency (KI-131), said on the Legal and Dispute cards too.
 *
 * Legal Recommendation and Collection Dispute face the same empty outcome catalogue as Deceased
 * Review. These tests prove the **same** hook and the **same** sentence reach both cards — nothing
 * process-specific decides it, only the type's catalogue.
 */

const WAIT = 5000;
const CASE_ID = 'case-1';
const TYPE_ID = 'type-under-test';

/** Set by the fake the moment the outcome catalogue is asked for. */
let catalogueAnswered = false;

interface Options {
  typeCode: 'P6-LEGALREC' | 'P6-DISPUTE';
  outcomes: Record<string, unknown>[] | 'unreadable';
}

/** A platform holding one case with one open activity of the type under test. */
function platform(options: Options): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string) => {
        if (logicalName === 'qdb_collectionactivitytype') {
          return {
            entities: [{
              qdb_collectionactivitytypeid: TYPE_ID,
              qdb_name: options.typeCode,
              qdb_code: options.typeCode,
              qdb_isactive: true,
            }],
          };
        }
        if (logicalName === 'qdb_collectionactivity') {
          return {
            entities: [{
              activityid: 'activity-1',
              subject: 'Open work of the type under test',
              statecode: 0,
              _qdb_activitytypeid_value: TYPE_ID,
              _qdb_collectioncaseid_value: CASE_ID,
              createdon: '2026-09-23T00:00:00Z',
            }],
          };
        }
        if (logicalName === 'qdb_activityoutcome') {
          catalogueAnswered = true;
          if (options.outcomes === 'unreadable') throw { errorCode: 12345, message: 'nope' };
          return { entities: options.outcomes };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

function renderLegal(outcomes: Options['outcomes']) {
  const adapter = new XrmCrmAdapter(platform({ typeCode: 'P6-LEGALREC', outcomes }));
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseLegalTrace caseId={CASE_ID} />
    </CrmSessionProvider>,
  );
}

function renderDisputes(outcomes: Options['outcomes']) {
  const adapter = new XrmCrmAdapter(
    platform({ typeCode: 'P6-DISPUTE', outcomes }), undefined, NO_COMPLAINT_METADATA as never);
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseConcerns caseId={CASE_ID} />
    </CrmSessionProvider>,
  );
}

/**
 * The Concerns card also resolves the Complaint case type from metadata, over the transport. That
 * is not what these tests are about, so the metadata is simply unavailable.
 */
const NO_COMPLAINT_METADATA = { get: async () => ({ status: 404, body: undefined }) };

const outcome = (id: string) => ({
  qdb_activityoutcomeid: id, qdb_name: id, qdb_code: id, qdb_isactive: true,
});

/**
 * A settled card, so an absence assertion means something. Waiting on the card and then on the
 * catalogue having been answered; each describe block proves the wait is long enough by requiring
 * the banner to appear within it in the empty case.
 */
async function settled(cardTestId: string): Promise<void> {
  await screen.findByTestId(cardTestId, {}, { timeout: WAIT });
  await waitFor(() => expect(catalogueAnswered).toBe(true), { timeout: WAIT });
}

afterEach(() => { cleanup(); catalogueAnswered = false; });

describe('the Legal card', () => {
  it('says a recommendation cannot be concluded, in the same words the dialog uses', async () => {
    renderLegal([]);

    const banner = await screen.findByTestId('legal-conclude-unavailable', {}, { timeout: WAIT });

    expect(banner.textContent).toContain(NO_OUTCOMES_CONFIGURED);
  });

  it('says nothing when outcomes are configured', async () => {
    renderLegal([outcome('o1')]);

    await settled('case-legal');

    expect(screen.queryByTestId('legal-conclude-unavailable')).toBeNull();
  });

  it('shows the banner within the same wait when none are', async () => {
    renderLegal([]);

    await settled('case-legal');

    expect(screen.queryByTestId('legal-conclude-unavailable')).not.toBeNull();
  });

  it('does not report an unreadable catalogue as an empty one', async () => {
    renderLegal('unreadable');

    await settled('case-legal');

    expect(screen.queryByTestId('legal-conclude-unavailable')).toBeNull();
  });
});

describe('the Collection disputes card', () => {
  it('says a dispute cannot be concluded, in the same words the dialog uses', async () => {
    renderDisputes([]);

    const banner = await screen.findByTestId('dispute-conclude-unavailable', {}, { timeout: WAIT });

    expect(banner.textContent).toContain(NO_OUTCOMES_CONFIGURED);
  });

  it('names the configuration, never the officer and never a fault', async () => {
    renderDisputes([]);

    const banner = await screen.findByTestId('dispute-conclude-unavailable', {}, { timeout: WAIT });

    expect(banner.textContent).not.toMatch(/error|failed|try again|you must|please/i);
  });

  it('says nothing when outcomes are configured', async () => {
    renderDisputes([outcome('o1')]);

    await settled('case-disputes');

    expect(screen.queryByTestId('dispute-conclude-unavailable')).toBeNull();
  });

  it('shows the banner within the same wait when none are', async () => {
    renderDisputes([]);

    await settled('case-disputes');

    expect(screen.queryByTestId('dispute-conclude-unavailable')).not.toBeNull();
  });

  it('does not report an unreadable catalogue as an empty one', async () => {
    renderDisputes('unreadable');

    await settled('case-disputes');

    expect(screen.queryByTestId('dispute-conclude-unavailable')).toBeNull();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CaseConcerns } from '../views/concernsCard.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * When the Integration Service cannot even be located — the configuration read fails — the card
 * says the current status could not be checked, rather than looking like "not set up".
 */
const WAIT = 5000;

function platformWhereConfigurationFails(): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string) => {
        if (logicalName === 'qdb_platformconfiguration') throw { errorCode: 2147746325, message: 'The configuration could not be read.' };
        if (logicalName === 'qdb_collectionactivitytype') return { entities: [{ qdb_collectionactivitytypeid: 't1', qdb_name: 'Dispute', qdb_code: 'P6-DISPUTE', qdb_isactive: true }] };
        if (logicalName === 'qdb_collectionactivity') {
          return { entities: [{ activityid: 'a1', subject: 'Complaint raised', statecode: 1, qdb_relatedrecordtype: 'incident', qdb_relatedrecordorganization: 100000141, qdb_relatedrecordid: 'c0ffee00-0000-4000-8000-000000000001', qdb_relatedrecordnumber: 'BFD-1' }] };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

afterEach(() => { cleanup(); });

describe('Customer complaints card', () => {
  it('should_say_the_status_could_not_be_checked_when_the_service_cannot_be_located', async () => {
    render(
      <CrmSessionProvider value={{ adapter: new XrmCrmAdapter(platformWhereConfigurationFails()), context: {}, integrationServiceToken: async () => 't' } as never}>
        <CaseConcerns caseId="case-1" organization="HL" />
      </CrmSessionProvider>,
    );

    expect((await screen.findByTestId('complaint-status-failure', {}, { timeout: WAIT })).textContent).toContain('could not be checked');
    expect(screen.getByTestId('case-complaints').textContent).toContain('BFD-1');
  });
});

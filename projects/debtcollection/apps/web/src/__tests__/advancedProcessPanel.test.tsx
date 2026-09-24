import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AdvancedProcessPanel } from '../views/advancedProcessPanel.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * WP6 — the capability matrix, driven by the platform's configuration rather than by the test.
 *
 * The fake holds the three advanced-process types and answers each one's outcome catalogue from a
 * script, so what is proved is the whole chain: resolve by code, count, derive, render.
 */

const WAIT = 5000;
const TYPES = [
  { qdb_collectionactivitytypeid: 't-legal', qdb_name: 'Legal', qdb_code: 'P6-LEGALREC', qdb_isactive: true },
  { qdb_collectionactivitytypeid: 't-deceased', qdb_name: 'Deceased / Insurance', qdb_code: 'P6-DECEASED', qdb_isactive: true },
  { qdb_collectionactivitytypeid: 't-dispute', qdb_name: 'Complaint / Dispute', qdb_code: 'P6-DISPUTE', qdb_isactive: true },
];

type Catalogue = number | 'unreadable';

/** Answers the outcome read for whichever type the query names. */
function platform(catalogues: Record<string, Catalogue>): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string, query = '') => {
        if (logicalName === 'qdb_collectionactivitytype') return { entities: TYPES };
        if (logicalName !== 'qdb_activityoutcome') return { entities: [] };
        const typeId = Object.keys(catalogues).find(id => decodeURIComponent(query).includes(id));
        const catalogue = typeId ? catalogues[typeId] : 0;
        if (catalogue === 'unreadable') throw { errorCode: 12345, message: 'nope' };
        return {
          entities: Array.from({ length: catalogue ?? 0 }, (_unused, index) => ({
            qdb_activityoutcomeid: `o-${index}`, qdb_name: `Outcome ${index}`, qdb_isactive: true,
          })),
        };
      },
    },
  } as unknown as XrmLike;
}

function renderPanel(catalogues: Record<string, Catalogue>) {
  const adapter = new XrmCrmAdapter(platform(catalogues));
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <AdvancedProcessPanel />
    </CrmSessionProvider>,
  );
}

const capabilityOf = (id: string) =>
  screen.getByTestId(`process-aspect-${id}`).dataset['capability'];

/** Waits until every conclusion row has left its initial *not known* state. */
async function settledConclusions(): Promise<void> {
  await screen.findByTestId('advanced-processes', {}, { timeout: WAIT });
  await waitFor(() => {
    for (const id of ['legal-conclude', 'deceased-conclude', 'dispute-conclude']) {
      expect(capabilityOf(id)).not.toBe('NotKnown');
    }
  }, { timeout: WAIT });
}

afterEach(cleanup);

describe('the organisation as it stands — no outcomes on any advanced type', () => {
  it.each(['legal-conclude', 'deceased-conclude', 'dispute-conclude'])(
    '%s awaits configuration', async id => {
      renderPanel({ 't-legal': 0, 't-deceased': 0, 't-dispute': 0 });

      await settledConclusions();

      expect(capabilityOf(id)).toBe('ConfigurationDependent');
    });
});

describe('a type QDB has configured', () => {
  it('becomes available, and only that type', async () => {
    renderPanel({ 't-legal': 0, 't-deceased': 2, 't-dispute': 0 });

    await settledConclusions();

    expect([capabilityOf('deceased-conclude'), capabilityOf('legal-conclude')])
      .toEqual(['Actionable', 'ConfigurationDependent']);
  });
});

describe('a catalogue that could not be read', () => {
  it('stays not known rather than becoming awaiting configuration', async () => {
    renderPanel({ 't-legal': 0, 't-deceased': 0, 't-dispute': 'unreadable' });

    await waitFor(() => expect(capabilityOf('legal-conclude')).toBe('ConfigurationDependent'), { timeout: WAIT });

    expect(capabilityOf('dispute-conclude')).toBe('NotKnown');
  });
});

describe('the panel', () => {
  it('keeps the Legal hand-off blocked', async () => {
    renderPanel({});

    await screen.findByTestId('advanced-processes', {}, { timeout: WAIT });

    expect(capabilityOf('legal-handoff')).toBe('Blocked');
  });

  it('offers no control of any kind', async () => {
    renderPanel({});

    const table = await screen.findByTestId('advanced-processes', {}, { timeout: WAIT });

    expect(table.closest('.section-card')?.querySelectorAll('button, a[href], [role="button"], input, select'))
      .toHaveLength(0);
  });

  it.each(['restructuring', 'field-visit'])('states %s is parked, and nothing more', async id => {
    renderPanel({});

    await screen.findByTestId('advanced-processes', {}, { timeout: WAIT });

    expect(capabilityOf(id)).toBe('Parked');
  });
});

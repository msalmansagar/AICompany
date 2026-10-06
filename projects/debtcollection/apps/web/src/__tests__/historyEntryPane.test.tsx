import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { HistoryEntry } from '@dcp/domain';
import type { ReactNode } from 'react';
import { HistoryEntryPane } from '../views/customer360/HistoryEntryPane.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

const EMPTY_PLATFORM = { WebApi: { retrieveRecord: async () => ({}), retrieveMultipleRecords: async () => ({ entities: [] }) } } as unknown as XrmLike;

function withSession(children: ReactNode) {
  return <CrmSessionProvider value={{ adapter: new XrmCrmAdapter(EMPTY_PLATFORM), context: {}, integrationServiceToken: async () => 't' } as never}>{children}</CrmSessionProvider>;
}

const SMS: HistoryEntry = {
  id: 'msg-1', source: 'letter', channel: 'SMS', occurredAt: '2026-10-06T08:20:00Z', subject: 'SMS to Aisha Al-Mansouri',
  status: 'Draft', direction: 'outbound', caseId: 'c-1', category: 'communications', recordedBy: 'Mohammad Salman',
};
const CONTEXT = { unit: 'HL Loan Account DEMO-HL-4401', caseNumber: 'DEMO-HL-1000' };

describe('a message opened from the history', () => {
  it('HistoryEntryPane_Message_ShowsTheRecordReadOnly', () => {
    render(withSession(<HistoryEntryPane entry={SMS} context={CONTEXT} onClose={vi.fn()} onSaved={vi.fn()} />));

    const pane = screen.getByTestId('history-record');

    expect(within(pane).getByText('To the customer')).toBeTruthy();
    expect(within(pane).getByText('HL Loan Account DEMO-HL-4401 · Case DEMO-HL-1000')).toBeTruthy();
    expect(within(pane).queryByRole('textbox')).toBeNull();
  });

  it('HistoryEntryPane_MessageTableName_IsNeverShown', () => {
    render(withSession(<HistoryEntryPane entry={SMS} context={CONTEXT} onClose={vi.fn()} onSaved={vi.fn()} />));

    expect(screen.getByTestId('history-record').textContent).not.toMatch(/letter|fax/i);
  });

  it('HistoryEntryPane_EscapePressed_Closes', () => {
    const onClose = vi.fn();
    render(withSession(<HistoryEntryPane entry={SMS} context={CONTEXT} onClose={onClose} onSaved={vi.fn()} />));

    fireEvent.keyDown(screen.getByTestId('history-record'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseLink, CustomerLink } from '../shell/RecordLinks.js';

/**
 * WP2: a customer name always opens Customer 360 and a case number always opens the case, in both
 * workspaces. The links sit inside clickable rows, so they must not also activate the row.
 */

afterEach(() => { cleanup(); window.location.hash = ''; });

describe('CustomerLink', () => {
  it('opens that customer\'s Customer 360', async () => {
    render(<CustomerLink customerBusinessId="28912345678">Fatima Al-Kuwari</CustomerLink>);

    await userEvent.click(screen.getByTestId('customer-link'));

    expect(window.location.hash).toBe('#customer/28912345678');
  });

  it('does not also activate the row it sits in', async () => {
    const rowOpens: string[] = [];
    render(
      <table><tbody>
        <tr onClick={() => rowOpens.push('click')} onKeyDown={() => rowOpens.push('key')}>
          <td><CustomerLink customerBusinessId="QID-1">Name</CustomerLink></td>
        </tr>
      </tbody></table>,
    );

    await userEvent.click(screen.getByTestId('customer-link'));
    screen.getByTestId('customer-link').focus();
    await userEvent.keyboard('{Enter}');

    expect(rowOpens).toEqual([]);
  });

  it('opens from the keyboard', async () => {
    render(<CustomerLink customerBusinessId="QID-2">Name</CustomerLink>);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(window.location.hash).toBe('#customer/QID-2');
  });

  it.each([undefined, '', '—'])('stays plain text when the customer id is %s', id => {
    render(<CustomerLink customerBusinessId={id}>Unknown</CustomerLink>);

    expect([screen.queryByTestId('customer-link'), screen.getByText('Unknown').tagName]).toEqual([null, 'SPAN']);
  });

  it('says where it goes, for a screen reader', () => {
    render(<CustomerLink customerBusinessId="QID-3">Fatima</CustomerLink>);

    expect(screen.getByTestId('customer-link').getAttribute('aria-label')).toBe('Open Customer 360 for Fatima');
  });
});

describe('CaseLink', () => {
  it('opens the Collection Case', async () => {
    render(<CaseLink caseId="c-1">COL-HL-000123</CaseLink>);

    await userEvent.click(screen.getByTestId('case-link'));

    expect(window.location.hash).toBe('#case/c-1');
  });

  it('opens the tab it is about', async () => {
    render(<CaseLink caseId="c-1" tab="ptp">COL-HL-000123</CaseLink>);

    await userEvent.click(screen.getByTestId('case-link'));

    expect(window.location.hash).toBe('#case/c-1/ptp');
  });

  it('does not also activate the row it sits in', async () => {
    const rowOpens: string[] = [];
    render(
      <table><tbody>
        <tr onClick={() => rowOpens.push('click')} onKeyDown={() => rowOpens.push('key')}>
          <td><CaseLink caseId="c-2">COL-HL-000200</CaseLink></td>
        </tr>
      </tbody></table>,
    );

    await userEvent.click(screen.getByTestId('case-link'));
    screen.getByTestId('case-link').focus();
    await userEvent.keyboard('{Enter}');

    expect(rowOpens).toEqual([]);
  });

  it('opens from the keyboard', async () => {
    render(<CaseLink caseId="c-3">COL-HL-000300</CaseLink>);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(window.location.hash).toBe('#case/c-3');
  });

  it.each([undefined, '', '—'])('stays plain text when the case id is %s', id => {
    render(<CaseLink caseId={id}>COL-?</CaseLink>);

    expect([screen.queryByTestId('case-link'), screen.getByText('COL-?').tagName]).toEqual([null, 'SPAN']);
  });
});

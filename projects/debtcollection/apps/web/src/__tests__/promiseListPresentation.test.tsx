import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromiseOutcome, formatDay } from '../components/primitives.js';
import { describeRecorder, loadApplicationUserIds } from '../data/applicationUsers.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * The Promise to Pay lists, read the way an officer reads them: a date in words, the promise's own
 * subject beside the customer, a status that does not shout, and a recorder that is a person or the
 * system — never an integration's account name.
 */

describe('a date in words', () => {
  it('says the day, the month and the year the way an officer does', () => {
    expect([formatDay('2026-08-04'), formatDay('2026-10-08T00:00:00Z'), formatDay(undefined), formatDay('nonsense')])
      .toEqual(['4 Aug 2026', '8 Oct 2026', '—', '—']);
  });
});

describe('the outcome', () => {
  it('keeps the unverified qualifier on a claim about payment, explained on hover', () => {
    render(<PromiseOutcome status="Kept" />);

    const marker = screen.getByText('unverified');
    expect([marker.getAttribute('title')?.includes('not been verified'), screen.getByText('Kept').className]).toEqual([true, 'pill plain ok']);
  });

  it('claims nothing about payment for an active promise', () => {
    render(<PromiseOutcome status="Active" />);

    expect(screen.queryByText('unverified')).toBeNull();
  });
});

describe('who recorded it', () => {
  it('names the system for a record owned by an application user, and the officer otherwise', () => {
    const applicationUsers = new Set(['app-1']);

    expect([
      describeRecorder({ ownerId: 'APP-1', ownerName: '# DFE Backend API' }, applicationUsers),
      describeRecorder({ ownerId: 'u-1', ownerName: 'Officer One' }, applicationUsers),
      describeRecorder({}, applicationUsers),
    ]).toEqual(['System', 'Officer One', '—']);
  });

  it('reads the application users once per session, as the users the organisation marks with an application id', async () => {
    const asked: unknown[] = [];
    const adapter = {
      async retrieveMultiple(entity: string, query: unknown) { asked.push([entity, query]); return [{ systemuserid: 'APP-1' }]; },
    } as unknown as XrmCrmAdapter;

    const first = await loadApplicationUserIds(adapter);
    const second = await loadApplicationUserIds(adapter);

    expect([asked, [...first], first === second]).toEqual([[['systemusers', { select: ['systemuserid'], filter: 'applicationid ne null' }]], ['app-1'], true]);
  });

  it('shows the platform name unchanged when the organisation will not list its application users', async () => {
    const adapter = { async retrieveMultiple() { throw { status: 403 }; } } as unknown as XrmCrmAdapter;

    expect(describeRecorder({ ownerId: 'app-1', ownerName: '# DFE Backend API' }, await loadApplicationUserIds(adapter))).toBe('# DFE Backend API');
  });
});

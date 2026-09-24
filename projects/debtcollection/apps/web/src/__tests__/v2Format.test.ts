import { describe, expect, it } from 'vitest';
import { formatRecordedAt } from '../v2/format.js';

/**
 * Browser QA showed "Recorded 10:42" on a record made at 13:42 in Doha: the time was the UTC portion
 * of the stored value, unlabelled. A recorded time is shown in the viewer's own local time.
 */
describe('formatRecordedAt', () => {
  it('shows the local date and time of the stored instant', () => {
    const iso = '2026-09-24T10:42:56Z';
    const local = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`;

    expect(formatRecordedAt(iso)).toBe(expected);
  });

  it('is not the UTC portion when the viewer is not on UTC', () => {
    const iso = '2026-09-24T10:42:56Z';
    const offsetMinutes = new Date(iso).getTimezoneOffset();

    expect(formatRecordedAt(iso) === '2026-09-24 10:42').toBe(offsetMinutes === 0);
  });

  it.each([undefined, '', 'not a date'])('shows %j as unknown', value => {
    expect(formatRecordedAt(value)).toBe('—');
  });
});

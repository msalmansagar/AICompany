import { describe, expect, it } from 'vitest';
import { formatWithShortMonths } from '../components/shortMonths.js';

/**
 * Three-letter months whatever the browser's locale data says. A formatter is stubbed so the "Sept"
 * branch runs even where the test environment's own data already writes "Sep".
 */

function formatterReturning(parts: Intl.DateTimeFormatPart[]): Intl.DateTimeFormat {
  return { formatToParts: () => parts } as unknown as Intl.DateTimeFormat;
}

const ANY_DATE = new Date('2026-09-18T00:00:00Z');

describe('formatWithShortMonths', () => {
  it('formatWithShortMonths_LocaleWritesSept_WritesSep', () => {
    const format = formatterReturning([{ type: 'day', value: '18' }, { type: 'literal', value: ' ' }, { type: 'month', value: 'Sept' }, { type: 'literal', value: ' ' }, { type: 'year', value: '2026' }]);
    expect(formatWithShortMonths(format, ANY_DATE)).toBe('18 Sep 2026');
  });

  it('formatWithShortMonths_OtherMonth_IsUnchanged', () => {
    const format = formatterReturning([{ type: 'day', value: '4' }, { type: 'literal', value: ' ' }, { type: 'month', value: 'Jun' }]);
    expect(formatWithShortMonths(format, ANY_DATE)).toBe('4 Jun');
  });

  it('formatWithShortMonths_SeptOutsideTheMonthPart_IsUnchanged', () => {
    const format = formatterReturning([{ type: 'literal', value: 'Sept' }]);
    expect(formatWithShortMonths(format, ANY_DATE)).toBe('Sept');
  });

  it('formatWithShortMonths_RealBritishFormatter_NeverWritesSept', () => {
    const format = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    expect(formatWithShortMonths(format, ANY_DATE)).toBe('18 Sep 2026');
  });
});

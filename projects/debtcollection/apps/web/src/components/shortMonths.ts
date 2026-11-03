/**
 * Formats a date with three-letter months everywhere: "19 Sep 2026", never "19 Sept 2026".
 *
 * The British short month for September became "Sept" in current browsers' locale data, so one
 * screen printed "Sep" in one panel and "Sept" in the next. Only the month part is touched; the
 * formatter's own order, time zone and time stay exactly as configured.
 */
export function formatWithShortMonths(format: Intl.DateTimeFormat, date: Date): string {
  return format.formatToParts(date)
    .map(part => (part.type === 'month' && part.value === 'Sept' ? 'Sep' : part.value))
    .join('');
}

/**
 * Snapshot dates as officers read them: `30-Sep-2026`, always three-letter months.
 *
 * Month names are written out rather than left to `Intl`, whose British short month for September is
 * now "Sept" — which is how one screen came to print both "Sep" and "Sept".
 *
 * The platform returns a snapshot date as a UTC timestamp: midnight in Doha on 18 September arrives as
 * `2026-09-17T22:04:43Z`. So a timestamp is read as its **Qatar** calendar date — reading the
 * `yyyy-mm-dd` part showed every snapshot a day early. A bare `yyyy-mm-dd` is already a calendar date.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const QATAR_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' });

interface CalendarDate { year: string; month: string; day: string }

function calendarDateOf(iso: string | undefined): CalendarDate | undefined {
  if (!iso) return undefined;
  const parts = DATE_ONLY.exec(iso)?.slice(1) ?? qatarParts(iso);
  const month = parts ? MONTHS[Number(parts[1]) - 1] : undefined;
  return parts && month ? { year: parts[0]!, month, day: parts[2]! } : undefined;
}

/** `[year, month, day]` of a timestamp in Doha; undefined when it is not a readable date. */
function qatarParts(iso: string): string[] | undefined {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return undefined;
  const parts = QATAR_PARTS.formatToParts(new Date(time));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '');
}

/** `30-Sep-2026`; an em dash when there is no readable date. */
export function formatSnapshotDay(iso: string | undefined): string {
  const date = calendarDateOf(iso);
  return date ? `${date.day}-${date.month}-${date.year}` : '—';
}

/**
 * The chart's axis labels: `Jun-2026` when every point falls in its own month (month-end snapshots),
 * otherwise `04-Sep` — weekly snapshots would all read `Sep-2026`.
 */
export function axisLabelsFor(isoDates: readonly (string | undefined)[]): string[] {
  const dates = isoDates.map(calendarDateOf);
  const months = dates.map(date => (date ? `${date.month}-${date.year}` : '—'));
  const isOnePerMonth = new Set(months).size === months.length;
  return isOnePerMonth ? months : dates.map(date => (date ? `${date.day}-${date.month}` : '—'));
}

/**
 * The date a customer's or case's balances are from — one quiet line under the figures.
 *
 * The balances are the last MIS position DCP stored; there is no live MIS read. Officers asked for
 * the "Stored MIS position" bar to go (it read as a warning about something they cannot act on), but
 * the date itself matters: an officer must not quote a two-week-old balance as today's.
 */
const QATAR_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Qatar' });

export function describeBalancesDate(asOf: string | undefined): string {
  if (!asOf || Number.isNaN(Date.parse(asOf))) return 'Balance date not available';
  return `Balances as of ${QATAR_DAY.format(new Date(asOf))}`;
}

/** `className` places the line in its screen; the wording and test id are the same everywhere. */
export function BalancesAsOf({ asOf, className = '' }: { asOf: string | undefined; className?: string }) {
  return <p className={`balances-as-of ${className}`.trim()} data-testid="balances-as-of">{describeBalancesDate(asOf)}</p>;
}

/**
 * The date the customer's balances are from — one quiet line under the figures.
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

export function BalancesAsOf({ asOf }: { asOf: string | undefined }) {
  return <p className="c360-hint c360-balances-as-of" data-testid="c360-balances-as-of">{describeBalancesDate(asOf)}</p>;
}

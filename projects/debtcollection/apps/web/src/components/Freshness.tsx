import type { MisResponseMeta } from '@dcp/domain';
import { Icon } from './primitives.js';

/**
 * Where a financial figure came from, and when.
 *
 * Phase 4 made every MIS answer carry its provenance; this is the half a person can see. The rule it
 * exists to keep is one sentence long: **cached financial information is never presented as current
 * live MIS.** An officer deciding whether to call a customer about an overdue amount needs to know
 * whether that amount is from a moment ago or from last night's failed run.
 *
 * Two timestamps are shown because they answer different questions. `As of` is the date MIS says the
 * figures describe; `Retrieved` is when this platform obtained them. A live read of a month-old
 * position is still a month-old position, and only showing one of the two would hide that.
 */

export function FreshnessIndicator({ meta, compact = false }: { meta: MisResponseMeta; compact?: boolean }) {
  const stale = meta.freshness === 'Cached';

  return (
    <div
      className={stale ? 'freshness cached' : 'freshness live'}
      data-testid="freshness"
      data-freshness={meta.freshness}
      data-provider={meta.provider}
      title={stale ? meta.staleReason : 'Read from MIS for this request'}
    >
      <Icon name={stale ? 'warn' : 'check'} />
      <span className="freshness-label">
        {stale ? 'Cached — not live MIS' : 'Live MIS'}
      </span>
      {!compact && (
        <span className="freshness-detail">
          <span data-testid="freshness-asof">As of {formatStamp(meta.misAsOfDate)}</span>
          <span data-testid="freshness-retrieved">Retrieved {formatStamp(meta.retrievedAt)}</span>
          {stale && meta.cachedAt && (
            <span data-testid="freshness-cachedat">Obtained {formatStamp(meta.cachedAt)}</span>
          )}
        </span>
      )}
      {meta.provider === 'Mock' && (
        <span className="freshness-provider" data-testid="freshness-mock">
          Mock provider — not real MIS data
        </span>
      )}
    </div>
  );
}

/**
 * The reason a figure is stale, spelled out.
 *
 * "Why am I looking at old numbers?" is the first question an officer asks, and Phase 4 made the
 * answer mandatory rather than optional, so it is always available to show.
 */
export function StaleReason({ meta }: { meta: MisResponseMeta }) {
  if (meta.freshness !== 'Cached' || !meta.staleReason) return null;
  return (
    <div className="stale-reason" data-testid="stale-reason">
      <Icon name="warn" />
      <span>{meta.staleReason}</span>
    </div>
  );
}

/**
 * What the case and snapshot tables hold: the position MIS reported when it last reported.
 *
 * This is **not** a live MIS read, and the difference matters enough to be stated on screen rather
 * than inferred. The MIS transport contract does not exist yet (KI-53), so no screen in this phase
 * can show a live figure — and a stored figure presented without qualification would read as one.
 */
export function StoredPositionNotice({ asOf, syncedOn }: { asOf?: string | undefined; syncedOn?: string | undefined }) {
  return (
    <div className="freshness stored" data-testid="stored-position" data-freshness="Stored">
      <Icon name="info" />
      <span className="freshness-label">Stored MIS position — not a live MIS read</span>
      <span className="freshness-detail">
        <span data-testid="stored-asof">As of {formatStamp(asOf)}</span>
        <span data-testid="stored-synced">Recorded {formatStamp(syncedOn)}</span>
      </span>
    </div>
  );
}

function formatStamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // Date-only values stay date-only; a timestamp keeps its time, because that is the point of it.
  return value.length <= 10 ? value : `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

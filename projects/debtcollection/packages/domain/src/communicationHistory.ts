/**
 * One chronological history over several native sources, without loading any of them.
 *
 * A case's communications live in three tables — `fax` for SMS and WhatsApp, `email`, and
 * `qdb_collectionactivity` for calls and visits — and OData cannot union across entity sets. The
 * obvious workaround is to read all of each and sort in the browser, which is precisely what the
 * permanent large-data NFR forbids: a customer with four years of history would fetch thousands of
 * rows to show twenty.
 *
 * So each source is read server-side, sorted and paged, and merged here by a **watermark**.
 *
 * The watermark is the whole idea. Each source hands over a buffer of rows newest-first. An item
 * may only be emitted once it is certainly newer than anything any *unexhausted* source could still
 * produce — that is, newer than the oldest row every unexhausted source has already shown. Emitting
 * past that point would put a row on screen and then discover an older-but-not-that-old row from
 * another table that should have appeared above it.
 *
 * The consequence is deliberate: a page may come back short, and the caller reads more from the
 * sources that ran dry rather than being handed a page that is wrong. A short page is a fact about
 * the data; a mis-ordered page is a defect.
 */

/** One entry in the unified history, whatever table it came from. */
export interface HistoryEntry {
  id: string;
  /** Which native table this came from — the UI labels by channel, never by table. */
  source: 'fax' | 'email' | 'activity';
  channel: string;
  occurredAt: string;
  subject: string;
  /** The platform's own status text. DCP never invents a delivery status (KI-83). */
  status: string;
  direction: 'outbound' | 'inbound' | 'unknown';
}

/** What one source has handed over, and whether it has more. */
export interface HistoryBuffer {
  key: string;
  /** Newest first, as the platform returned them. */
  items: readonly HistoryEntry[];
  /** False once the source has no further pages — it then constrains nothing. */
  hasMore: boolean;
}

export interface MergedHistory {
  /** Safe to display, newest first. */
  page: readonly HistoryEntry[];
  /** What each source still holds, to carry into the next merge. */
  remaining: readonly HistoryBuffer[];
  /**
   * Sources that must be read further before the merge can continue.
   *
   * Empty when the page filled from what was already buffered. Non-empty when the watermark, not
   * the page size, is what stopped it — the caller fetches those and merges again.
   */
  starved: readonly string[];
}

const time = (entry: HistoryEntry): number => Date.parse(entry.occurredAt);

/**
 * The oldest moment that can still be emitted safely.
 *
 * For every source that has more rows to give, the last row it handed over is the newest row it
 * could still surprise us with. Nothing older than the newest of those limits may be emitted yet. A
 * source with more rows but an empty buffer constrains everything, because it could produce a row
 * of any age — which is what `starved` reports.
 */
function watermark(buffers: readonly HistoryBuffer[]): { limit: number; starved: readonly string[] } {
  let limit = Number.NEGATIVE_INFINITY;
  const starved: string[] = [];

  for (const buffer of buffers) {
    if (!buffer.hasMore) continue;
    const oldest = buffer.items[buffer.items.length - 1];
    if (!oldest) {
      starved.push(buffer.key);
      continue;
    }
    limit = Math.max(limit, time(oldest));
  }
  return { limit, starved };
}

/**
 * Merges the buffered sources into one page that is certainly in order.
 *
 * Ties are broken by id so the order is stable across calls: two activities logged in the same
 * second must not swap places between renders, which reads as the list flickering.
 */
export function mergeHistory(
  buffers: readonly HistoryBuffer[],
  pageSize: number,
): MergedHistory {
  const { limit, starved } = watermark(buffers);

  if (starved.length > 0) {
    return { page: [], remaining: buffers, starved };
  }

  const candidates = buffers
    .flatMap(buffer => buffer.items.map(item => ({ key: buffer.key, item })))
    // Strictly newer, not "newer or equal". A source could hold another row at exactly the moment
    // of its oldest shown row, and that row might sort above this one on the id tie-break — so the
    // boundary row waits for the next read rather than being placed and then contradicted.
    .filter(entry => time(entry.item) > limit)
    .sort((a, b) => time(b.item) - time(a.item) || a.item.id.localeCompare(b.item.id));

  const taken = candidates.slice(0, Math.max(pageSize, 0));
  const takenIds = new Set(taken.map(entry => entry.item.id));

  const remaining = buffers.map(buffer => ({
    key: buffer.key,
    items: buffer.items.filter(item => !takenIds.has(item.id)),
    hasMore: buffer.hasMore,
  }));

  // The page was cut short by the watermark rather than by its size: the caller needs more rows
  // from whichever sources could still hold something in the gap.
  const cutShort = taken.length < pageSize;
  return {
    page: taken.map(entry => entry.item),
    remaining,
    starved: cutShort ? remaining.filter(buffer => buffer.hasMore).map(buffer => buffer.key) : [],
  };
}

/** True once every source is exhausted and nothing is left buffered. */
export function historyComplete(buffers: readonly HistoryBuffer[]): boolean {
  return buffers.every(buffer => !buffer.hasMore && buffer.items.length === 0);
}

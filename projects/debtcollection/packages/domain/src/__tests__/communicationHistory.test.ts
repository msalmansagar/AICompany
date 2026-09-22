import { describe, expect, it } from 'vitest';
import {
  historyComplete, mergeHistory, type HistoryBuffer, type HistoryEntry,
} from '../communicationHistory.js';

/**
 * The merge, and the one property that matters: **nothing is emitted that a later read could
 * displace**.
 *
 * It would be easy to write a merge that looks right on a tidy fixture and reorders in production,
 * because the failure only appears when one source is denser than another — exactly the shape real
 * data has, where a customer gets fifty SMS and two emails. So the tests below are mostly about
 * what the merge **refuses** to emit.
 */

const entry = (id: string, occurredAt: string, source: HistoryEntry['source'] = 'fax'): HistoryEntry => ({
  id, source, channel: source === 'email' ? 'Email' : 'SMS', occurredAt,
  subject: `subject ${id}`, status: 'Open', direction: 'outbound',
});

const buffer = (key: string, items: HistoryEntry[], hasMore = false): HistoryBuffer =>
  ({ key, items, hasMore });

describe('merging chronologically', () => {
  it('interleaves two sources by time', () => {
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z'), entry('f2', '2026-09-18T10:00:00Z')]),
      buffer('email', [entry('e1', '2026-09-19T10:00:00Z', 'email')]),
    ], 10);

    expect(merged.page.map(e => e.id)).toEqual(['f1', 'e1', 'f2']);
  });

  it('returns nothing older than a source that could still produce it', () => {
    // The fax source has more pages and has only shown back to the 19th. An email from the 18th
    // must wait: a fax from the 18th-and-a-half could still arrive and belong above it.
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z'), entry('f2', '2026-09-19T10:00:00Z')], true),
      buffer('email', [entry('e1', '2026-09-18T10:00:00Z', 'email')]),
    ], 10);

    // f2 is the fax source's oldest shown row, so it waits too: another fax at the same moment
    // could still arrive and sort above it.
    expect(merged.page.map(e => e.id)).toEqual(['f1']);
    expect(merged.starved, 'the caller is told which source to read further').toEqual(['fax']);
  });

  it('emits freely once every source is exhausted', () => {
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z')]),
      buffer('email', [entry('e1', '2026-09-01T10:00:00Z', 'email')]),
    ], 10);

    expect(merged.page.map(e => e.id)).toEqual(['f1', 'e1']);
    expect(merged.starved).toEqual([]);
  });

  it('refuses to emit anything while a source with more pages has shown nothing', () => {
    // A source that has more rows and an empty buffer could produce a row of any age, so no order
    // is safe yet. Emitting the other source's rows here is the defect this guards.
    const merged = mergeHistory([
      buffer('fax', [], true),
      buffer('email', [entry('e1', '2026-09-19T10:00:00Z', 'email')]),
    ], 10);

    expect(merged.page).toEqual([]);
    expect(merged.starved).toEqual(['fax']);
  });

  it('keeps what it did not emit, so nothing is lost between merges', () => {
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z'), entry('f2', '2026-09-19T10:00:00Z')]),
    ], 1);

    expect(merged.page.map(e => e.id)).toEqual(['f1']);
    expect(merged.remaining[0]?.items.map(e => e.id)).toEqual(['f2']);
  });

  it('does not report starvation when the page was simply full', () => {
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z'), entry('f2', '2026-09-19T10:00:00Z')], true),
    ], 1);

    expect(merged.page).toHaveLength(1);
    expect(merged.starved, 'the page size stopped it, not the watermark').toEqual([]);
  });

  it('breaks ties by id so the order does not flicker between renders', () => {
    const sameMoment = '2026-09-20T10:00:00Z';
    const first = mergeHistory([
      buffer('fax', [entry('b', sameMoment)]),
      buffer('email', [entry('a', sameMoment, 'email')]),
    ], 10);
    const second = mergeHistory([
      buffer('email', [entry('a', sameMoment, 'email')]),
      buffer('fax', [entry('b', sameMoment)]),
    ], 10);

    expect(first.page.map(e => e.id)).toEqual(second.page.map(e => e.id));
  });

  it('survives a source that is empty and finished', () => {
    const merged = mergeHistory([
      buffer('fax', [entry('f1', '2026-09-20T10:00:00Z')]),
      buffer('activity', []),
    ], 10);
    expect(merged.page.map(e => e.id)).toEqual(['f1']);
  });

  it('handles three sources of very different density', () => {
    const merged = mergeHistory([
      buffer('fax', Array.from({ length: 5 }, (_, i) =>
        entry(`f${i}`, `2026-09-${20 - i}T10:00:00Z`)), true),
      buffer('email', [entry('e1', '2026-09-19T12:00:00Z', 'email')]),
      buffer('activity', [entry('a1', '2026-09-20T09:00:00Z', 'activity')]),
    ], 10);

    // Only rows at or newer than the fax source's oldest shown row may be emitted.
    const ids = merged.page.map(e => e.id);
    expect(ids[0]).toBe('f0');
    expect(ids).toContain('a1');
    expect(ids, 'nothing past the watermark').not.toContain('f4');
  });
});

describe('knowing when the history is finished', () => {
  it('is complete only when every source is exhausted and drained', () => {
    expect(historyComplete([buffer('fax', []), buffer('email', [])])).toBe(true);
    expect(historyComplete([buffer('fax', [], true)])).toBe(false);
    expect(historyComplete([buffer('fax', [entry('f1', '2026-09-20T10:00:00Z')])])).toBe(false);
  });
});

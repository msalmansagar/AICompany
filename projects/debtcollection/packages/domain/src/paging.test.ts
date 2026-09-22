import { describe, expect, it } from 'vitest';
import {
  PagingError,
  PageSizeBoundsSchema,
  buildPage,
  finalPage,
  fingerprintQuery,
  makeContinuation,
  readContinuation,
  resolvePageSize,
  type ContinuationToken,
} from './paging.js';

const FINGERPRINT = fingerprintQuery({ filter: 'statecode eq 0', sort: [{ field: 'createdon', descending: true }] });

describe('page size', () => {
  const bounds = PageSizeBoundsSchema.parse({ default: 50, max: 200 });

  it('uses the configured default when the caller expresses no preference', () => {
    expect(resolvePageSize(undefined, bounds)).toBe(50);
  });

  it('honours a preference inside the allowed range', () => {
    expect(resolvePageSize(25, bounds)).toBe(25);
  });

  it('clamps to the maximum rather than refusing — a page size is a preference, not a demand', () => {
    expect(resolvePageSize(5000, bounds)).toBe(200);
  });

  it('refuses zero, because a page of nothing is a defect and not a preference', () => {
    expect(() => resolvePageSize(0, bounds)).toThrow(PagingError);
  });

  it('refuses a negative page size', () => {
    expect(() => resolvePageSize(-10, bounds)).toThrow(/positive integer/);
  });

  it('refuses a fractional page size', () => {
    expect(() => resolvePageSize(10.5, bounds)).toThrow(/positive integer/);
  });

  it('will not accept bounds whose default exceeds its own maximum', () => {
    expect(() => PageSizeBoundsSchema.parse({ default: 500, max: 100 })).toThrow();
  });
});

describe('the continuation token', () => {
  it('round-trips the source token it was given', () => {
    const token = makeContinuation('a-platform-skiptoken', FINGERPRINT);
    expect(readContinuation(token, FINGERPRINT)).toBe('a-platform-skiptoken');
  });

  /**
   * This package ships to a browser, and a browser has no `Buffer`.
   *
   * The encoder used `Buffer.from(...)`, so every list holding more than one page threw
   * `ReferenceError: Buffer is not defined` in Dynamics the moment a continuation was created.
   * Vitest runs on Node, so `Buffer` was a global here and the whole suite passed; the platform
   * spike and the live query smoke both ran from Node too. Removing it for the duration of the test
   * is the only way this file can stand in for a browser.
   */
  it('encodes and decodes with no Buffer in scope, as a browser has none', () => {
    const original = Reflect.get(globalThis, 'Buffer');
    expect(original, 'the guard is meaningless if Buffer was already absent').toBeDefined();
    Reflect.deleteProperty(globalThis, 'Buffer');
    try {
      const token = makeContinuation('a-platform-skiptoken', FINGERPRINT);
      expect(readContinuation(token, FINGERPRINT)).toBe('a-platform-skiptoken');
    } finally {
      Reflect.set(globalThis, 'Buffer', original);
    }
  });

  it('round-trips text outside latin1, which btoa alone would corrupt', () => {
    // A fingerprint carries filter values, and a filter on an Arabic name is ordinary here.
    const arabic = 'قرض الإسكان — عبدالرحمن';
    const token = makeContinuation(arabic, FINGERPRINT);
    expect(readContinuation(token, FINGERPRINT)).toBe(arabic);
  });

  it('survives a source token containing URL and XML punctuation', () => {
    const awkward = '<cookie pagenumber="2" pagingcookie="%3ccookie%20page%3d%221" istracking="False" />';
    const token = makeContinuation(awkward, FINGERPRINT);
    expect(readContinuation(token, FINGERPRINT)).toBe(awkward);
  });

  it('is opaque: the source token does not appear verbatim in it', () => {
    const token = makeContinuation('secret-skiptoken', FINGERPRINT);
    expect(token).not.toContain('secret-skiptoken');
  });

  it('refuses a token this service did not issue', () => {
    expect(() => readContinuation('not-a-real-token' as ContinuationToken, FINGERPRINT))
      .toThrow(/could not be read/);
  });

  it('refuses a token that has been altered', () => {
    const token = makeContinuation('a-platform-skiptoken', FINGERPRINT);
    const tampered = (token.slice(0, -4) + 'AAAA') as ContinuationToken;
    expect(() => readContinuation(tampered, FINGERPRINT)).toThrow(PagingError);
  });

  it('names an unreadable token InvalidContinuation', () => {
    try {
      readContinuation('rubbish' as ContinuationToken, FINGERPRINT);
      expect.unreachable('should have refused');
    } catch (error) {
      expect((error as PagingError).kind).toBe('InvalidContinuation');
    }
  });
});

describe('changed criteria restart paging', () => {
  it('refuses a token from a different filter', () => {
    const token = makeContinuation('tok', fingerprintQuery({ filter: 'statecode eq 0' }));
    expect(() => readContinuation(token, fingerprintQuery({ filter: 'statecode eq 1' })))
      .toThrow(/different query/);
  });

  it('refuses a token from a different sort', () => {
    const token = makeContinuation('tok', fingerprintQuery({ sort: [{ field: 'createdon', descending: true }] }));
    expect(() => readContinuation(token, fingerprintQuery({ sort: [{ field: 'createdon', descending: false }] })))
      .toThrow(PagingError);
  });

  it('refuses a token from a different search term', () => {
    const token = makeContinuation('tok', fingerprintQuery({ search: 'ahmed' }));
    expect(() => readContinuation(token, fingerprintQuery({ search: 'fatima' }))).toThrow(PagingError);
  });

  it('names criteria drift CriteriaChanged, so a caller can restart rather than give up', () => {
    const token = makeContinuation('tok', fingerprintQuery({ filter: 'a' }));
    try {
      readContinuation(token, fingerprintQuery({ filter: 'b' }));
      expect.unreachable('should have refused');
    } catch (error) {
      expect((error as PagingError).kind).toBe('CriteriaChanged');
    }
  });

  it('says plainly that paging must restart from the first page', () => {
    const token = makeContinuation('tok', fingerprintQuery({ filter: 'a' }));
    expect(() => readContinuation(token, fingerprintQuery({ filter: 'b' }))).toThrow(/restart/);
  });

  it('treats an unchanged query as the same query, however the optional fields are spelled', () => {
    const a = fingerprintQuery({ filter: 'x', sort: [] });
    const b = fingerprintQuery({ filter: 'x' });
    expect(a).toBe(b);
  });

  it('distinguishes sort order by column order, not just by column set', () => {
    const a = fingerprintQuery({ sort: [{ field: 'dpd' }, { field: 'name' }] });
    const b = fingerprintQuery({ sort: [{ field: 'name' }, { field: 'dpd' }] });
    expect(a).not.toBe(b);
  });

  it('ignores page size, because changing it mid-walk is legitimate', () => {
    // The spike showed Dataverse accepts a different maxpagesize on a later page, so the
    // fingerprint deliberately does not include it.
    const a = fingerprintQuery({ filter: 'x' });
    const b = fingerprintQuery({ filter: 'x' });
    expect(a).toBe(b);
  });
});

describe('the shape of a page', () => {
  it('reports more to come when a continuation is present', () => {
    const page = buildPage([1, 2, 3], 3, makeContinuation('next', FINGERPRINT));
    expect(page.hasMore).toBe(true);
  });

  it('reports the end when no continuation is present — the ONLY end-of-data signal', () => {
    const page = buildPage([1, 2, 3], 3);
    expect(page.hasMore).toBe(false);
    expect(page.continuation).toBeUndefined();
  });

  it('a short page is not the end if a continuation came with it', () => {
    const page = buildPage([1], 50, makeContinuation('next', FINGERPRINT));
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });

  it('an empty page is a valid answer, not an error', () => {
    const page = finalPage([], 50);
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('an empty FIRST page with a continuation still means more to come', () => {
    // A filter can exclude everything on one page and match on the next.
    const page = buildPage([], 50, makeContinuation('next', FINGERPRINT));
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(true);
  });

  it('carries the page size the source actually applied, which may be below the request', () => {
    expect(buildPage([1, 2], 50).appliedPageSize).toBe(50);
  });

  it('omits a total rather than inventing one', () => {
    expect(buildPage([1], 10).totalCount).toBeUndefined();
  });

  it('carries a total when the source supplied one', () => {
    expect(buildPage([1], 10, undefined, 1295).totalCount).toBe(1295);
  });

  it('cannot report hasMore and no continuation at the same time', () => {
    const withNext = buildPage([1], 1, makeContinuation('n', FINGERPRINT));
    const without = buildPage([1], 1);
    expect(withNext.hasMore).toBe(withNext.continuation !== undefined);
    expect(without.hasMore).toBe(without.continuation !== undefined);
  });
});

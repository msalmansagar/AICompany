import { describe, expect, it } from 'vitest';
import { mergeHeaders } from './DataverseClient.js';

const BASE = { Authorization: 'Bearer x', Prefer: 'odata.include-annotations="*"' };

describe('merging request headers', () => {
  it('combines Prefer rather than replacing it', () => {
    const merged = mergeHeaders(BASE, { Prefer: 'odata.maxpagesize=50' });
    expect(merged['Prefer']).toBe('odata.include-annotations="*",odata.maxpagesize=50');
  });

  it('keeps the annotations preference that paging used to destroy', () => {
    // Measured on org5869857f: with maxpagesize alone a row came back carrying only @odata.etag —
    // no formatted value and no lookuplogicalname. The Customer lookup is polymorphic, so losing
    // lookuplogicalname loses the only thing that tells contact from account.
    const merged = mergeHeaders(BASE, { Prefer: 'odata.maxpagesize=1' });
    expect(merged['Prefer']).toContain('include-annotations');
    expect(merged['Prefer']).toContain('maxpagesize');
  });

  it('overrides any other header normally', () => {
    expect(mergeHeaders(BASE, { Authorization: 'Bearer y' })['Authorization']).toBe('Bearer y');
  });

  it('uses the extra Prefer when the base has none', () => {
    expect(mergeHeaders({ Accept: 'json' }, { Prefer: 'odata.maxpagesize=5' })['Prefer'])
      .toBe('odata.maxpagesize=5');
  });

  it('leaves the base Prefer alone when no extra is supplied', () => {
    expect(mergeHeaders(BASE, {})['Prefer']).toBe('odata.include-annotations="*"');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { EntitySetNameResolver } from './EntitySetNameResolver.js';

describe('EntitySetNameResolver', () => {
  it('returnsTheNameFromMetadata_notTheNaivePlural', async () => {
    // opportunity -> opportunities is an active submission target in this org; appending
    // "s" produces /opportunitys and a 404.
    const fetchMetadata = vi.fn(async () => ({ EntitySetName: 'opportunities' })) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new EntitySetNameResolver(fetchMetadata);

    expect(await resolver.resolve('opportunity')).toBe('opportunities');
  });

  it('handlesCustomEntities_whoseSetNameIsIrregular', async () => {
    const fetchMetadata = vi.fn(async () => ({ EntitySetName: 'qdb_activities' })) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new EntitySetNameResolver(fetchMetadata);

    expect(await resolver.resolve('qdb_activity')).toBe('qdb_activities');
  });

  it('cachesPerEntity', async () => {
    const fetchMetadata = vi.fn(async () => ({ EntitySetName: 'contacts' })) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new EntitySetNameResolver(fetchMetadata);

    await resolver.resolve('contact');
    await resolver.resolve('contact');

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('fallsBackToTheNaivePlural_whenMetadataCannotBeRead', async () => {
    // A metadata outage must not fail every write; the fallback is what the code did before.
    const failing = vi.fn(async () => { throw new Error('no metadata privilege'); }) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new EntitySetNameResolver(failing);

    expect(await resolver.resolve('contact')).toBe('contacts');
  });

  it('prefersASeededOverride_withoutCallingMetadata', async () => {
    const fetchMetadata = vi.fn(async () => ({ EntitySetName: 'wrong' })) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new EntitySetNameResolver(fetchMetadata);

    resolver.seed('qdb_thing', 'qdb_thingies');

    expect(await resolver.resolve('qdb_thing')).toBe('qdb_thingies');
    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});

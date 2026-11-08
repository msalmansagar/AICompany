import { describe, it, expect, vi } from 'vitest';
import { LookupBindingResolver, toBindingEntry } from './LookupBindingResolver.js';

const RELATIONSHIP_PATH = '/RelationshipDefinitions';
const ENTITY_PATH = '/EntityDefinitions';

// entitySetName is nullable rather than optional: passing undefined would fall back to
// the default and silently defeat the "cannot be resolved" case.
function makeFetch(relationships: unknown[], entitySetName: string | null = 'accounts') {
  return vi.fn(async (path: string) => {
    if (path.startsWith(RELATIONSHIP_PATH)) return { value: relationships };
    if (path.startsWith(ENTITY_PATH)) return entitySetName ? { EntitySetName: entitySetName } : {};
    throw new Error(`unexpected path ${path}`);
  }) as unknown as <T>(path: string) => Promise<T>;
}

const SIMPLE_RELATIONSHIP = [{
  ReferencingAttribute: 'qdb_customerid',
  ReferencingEntityNavigationPropertyName: 'qdb_CustomerId',
  ReferencedEntity: 'account',
}];

describe('LookupBindingResolver', () => {
  it('returnsTheNavigationProperty_notTheColumnName', async () => {
    const resolver = new LookupBindingResolver(makeFetch(SIMPLE_RELATIONSHIP));

    const binding = await resolver.resolve('qdb_application', 'qdb_customerid', 'account');

    // The column is qdb_customerid; the writable name differs in casing.
    expect(binding).toEqual({ navigationProperty: 'qdb_CustomerId', entitySetName: 'accounts' });
  });

  it('picksTheTargetSpecificProperty_forAPolymorphicLookup', async () => {
    const resolver = new LookupBindingResolver(makeFetch([
      { ReferencingAttribute: 'parentcustomerid', ReferencingEntityNavigationPropertyName: 'parentcustomerid_account', ReferencedEntity: 'account' },
      { ReferencingAttribute: 'parentcustomerid', ReferencingEntityNavigationPropertyName: 'parentcustomerid_contact', ReferencedEntity: 'contact' },
    ], 'contacts'));

    const binding = await resolver.resolve('contact', 'parentcustomerid', 'contact');

    expect(binding?.navigationProperty).toBe('parentcustomerid_contact');
  });

  it('returnsNull_whenTheAttributeIsNotALookup', async () => {
    const resolver = new LookupBindingResolver(makeFetch([]));

    expect(await resolver.resolve('qdb_application', 'qdb_amount', 'account')).toBeNull();
  });

  it('returnsNull_whenTheEntitySetCannotBeResolved', async () => {
    const resolver = new LookupBindingResolver(makeFetch(SIMPLE_RELATIONSHIP, null));

    expect(await resolver.resolve('qdb_application', 'qdb_customerid', 'account')).toBeNull();
  });

  it('survivesAMetadataFailure_ratherThanBreakingTheSubmission', async () => {
    const failing = vi.fn(async () => { throw new Error('metadata unavailable'); }) as unknown as <T>(p: string) => Promise<T>;
    const resolver = new LookupBindingResolver(failing);

    expect(await resolver.resolve('qdb_application', 'qdb_customerid', 'account')).toBeNull();
  });

  it('cachesBothMetadataCalls', async () => {
    const fetchMetadata = makeFetch(SIMPLE_RELATIONSHIP);
    const resolver = new LookupBindingResolver(fetchMetadata);

    await resolver.resolve('qdb_application', 'qdb_customerid', 'account');
    await resolver.resolve('qdb_application', 'qdb_customerid', 'account');

    // one relationship call + one entity-definition call, not four
    expect(fetchMetadata).toHaveBeenCalledTimes(2);
  });
});

describe('toBindingEntry', () => {
  it('formatsThePayloadKeyAndReference', () => {
    const entry = toBindingEntry(
      { navigationProperty: 'qdb_CustomerId', entitySetName: 'accounts' },
      '11111111-1111-1111-1111-111111111111',
    );

    expect(entry).toEqual([
      'qdb_CustomerId@odata.bind',
      '/accounts(11111111-1111-1111-1111-111111111111)',
    ]);
  });

  it('stripsBracesFromTheGuid', () => {
    const [, reference] = toBindingEntry(
      { navigationProperty: 'qdb_CustomerId', entitySetName: 'accounts' },
      '{11111111-1111-1111-1111-111111111111}',
    );

    expect(reference).toBe('/accounts(11111111-1111-1111-1111-111111111111)');
  });
});

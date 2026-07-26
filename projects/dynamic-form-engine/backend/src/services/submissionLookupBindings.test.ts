import { describe, it, expect, vi } from 'vitest';
import type { FieldDefinition, FormDefinition, SubmissionMapping } from '@qdb/shared';
import { indexFieldsById, joinLookupRecordIds, readLookupRecordId, resolveLookupBindings } from './submissionLookupBindings.js';
import type { LookupBindingResolver } from './LookupBindingResolver.js';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'text',
    schemaName: 'qdb_text',
    label: 'Text',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    ...overrides,
  } as FieldDefinition;
}

function makeForm(fields: FieldDefinition[]): FormDefinition {
  return {
    id: 'form-1',
    formCode: 'demo',
    title: 'Demo',
    tabs: [{
      id: 'tab-1',
      label: 'Tab',
      displayOrder: 1,
      isVisible: true,
      sections: [{ id: 'section-1', label: 'Section', displayOrder: 1, columns: 1, isVisible: true, fields }],
    }],
    submissionMappings: [],
  } as unknown as FormDefinition;
}

function makeMapping(overrides: Partial<SubmissionMapping>): SubmissionMapping {
  return {
    id: 'map-1',
    fieldId: 'field-1',
    targetEntityLogicalName: 'qdb_application',
    targetAttributeLogicalName: 'qdb_customerid',
    isMappedToChildEntity: false,
    isActive: true,
    ...overrides,
  } as SubmissionMapping;
}

const BINDING = { navigationProperty: 'qdb_CustomerId', entitySetName: 'accounts' };

function makeResolver(binding = BINDING) {
  return { resolve: vi.fn(async () => binding) } as unknown as LookupBindingResolver;
}

describe('readLookupRecordId', () => {
  it('readsTheIdFromASelection', () => {
    // What the renderer stores when the user picks from the lookup — an object, not a GUID.
    expect(readLookupRecordId({ id: 'abc-123', displayName: 'Qatar National Bank' })).toBe('abc-123');
  });

  it('acceptsABareGuid', () => {
    expect(readLookupRecordId('abc-123')).toBe('abc-123');
  });

  it('returnsNull_forAnEmptyOrUnrecognisedValue', () => {
    expect(readLookupRecordId('')).toBeNull();
    expect(readLookupRecordId('   ')).toBeNull();
    expect(readLookupRecordId(null)).toBeNull();
    expect(readLookupRecordId({ displayName: 'no id here' })).toBeNull();
    expect(readLookupRecordId(42)).toBeNull();
  });
});

describe('joinLookupRecordIds', () => {
  const FIRST = '11111111-1111-1111-1111-111111111111';
  const SECOND = '22222222-2222-2222-2222-222222222222';

  it('joinsASelection_intoDelimitedRecordIds', () => {
    // What the multi-lookup control stores: an array of { id, displayName }.
    const value = [{ id: FIRST, displayName: 'One' }, { id: SECOND, displayName: 'Two' }];

    expect(joinLookupRecordIds(value)).toBe(`${FIRST};${SECOND}`);
  });

  it('acceptsBareGuids', () => {
    expect(joinLookupRecordIds([FIRST, SECOND])).toBe(`${FIRST};${SECOND}`);
  });

  it('throwsOnANonUuidId_ratherThanWritingIt', () => {
    // A crafted id must never reach Dataverse inside the delimited string.
    expect(() => joinLookupRecordIds([{ id: 'g1;injected', displayName: 'x' }])).toThrow();
  });

  it('returnsNull_forAnEmptySelection', () => {
    expect(joinLookupRecordIds([])).toBeNull();
  });

  it('returnsNull_forArraysThatAreNotLookupSelections', () => {
    // File references and plain values keep their own handling.
    expect(joinLookupRecordIds([{ fileId: 'f1', fileName: 'a.pdf' }])).toBeNull();
    expect(joinLookupRecordIds('not-an-array')).toBeNull();
  });
});

describe('indexFieldsById', () => {
  it('includesTabHeaderAndFooterFields', () => {
    const form = makeForm([makeField({ id: 'body' })]);
    form.tabs[0].headerFields = [makeField({ id: 'header' })];
    form.tabs[0].footerFields = [makeField({ id: 'footer' })];

    const fields = indexFieldsById(form);

    expect([...fields.keys()].sort()).toEqual(['body', 'footer', 'header']);
  });
});

describe('resolveLookupBindings', () => {
  it('resolvesABindingForALookupField', async () => {
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));

    const bindings = await resolveLookupBindings([makeMapping({})], fields, makeResolver());

    expect(bindings.get('qdb_customerid')).toEqual(BINDING);
  });

  it('ignoresNonLookupFields_soPlainColumnsKeepTheirDirectAssignment', async () => {
    const fields = indexFieldsById(makeForm([makeField({ fieldType: 'text' })]));
    const resolver = makeResolver();

    const bindings = await resolveLookupBindings([makeMapping({})], fields, resolver);

    expect(bindings.size).toBe(0);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('ignoresALookupFieldWithNoTargetEntity', async () => {
    const fields = indexFieldsById(makeForm([makeField({ fieldType: 'lookup' })]));

    const bindings = await resolveLookupBindings([makeMapping({})], fields, makeResolver());

    expect(bindings.size).toBe(0);
  });

  it('resolvesEachTargetAttributeOnce', async () => {
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));
    const resolver = makeResolver();

    await resolveLookupBindings(
      [makeMapping({ id: 'a' }), makeMapping({ id: 'b' })],
      fields,
      resolver,
    );

    expect(resolver.resolve).toHaveBeenCalledTimes(1);
  });

  it('usesTheMappingOverride_withoutConsultingMetadata', async () => {
    // The escape hatch: an environment where metadata cannot be read, or a value pinned
    // for review. Both halves set means no metadata call at all.
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));
    const resolver = makeResolver();
    const mapping = makeMapping({
      targetNavigationProperty: 'qdb_PinnedProperty',
      targetEntitySetName: 'qdb_pinnedsets',
    });

    const bindings = await resolveLookupBindings([mapping], fields, resolver);

    expect(bindings.get('qdb_customerid')).toEqual({
      navigationProperty: 'qdb_PinnedProperty',
      entitySetName: 'qdb_pinnedsets',
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('layersASingleOverrideOnTopOfMetadata', async () => {
    // Only one half pinned — the other still comes from metadata.
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));
    const resolver = makeResolver();
    const mapping = makeMapping({ targetEntitySetName: 'qdb_pinnedsets' });

    const bindings = await resolveLookupBindings([mapping], fields, resolver);

    expect(bindings.get('qdb_customerid')).toEqual({
      navigationProperty: BINDING.navigationProperty, // resolved
      entitySetName: 'qdb_pinnedsets',                // pinned
    });
    expect(resolver.resolve).toHaveBeenCalled();
  });

  it('omitsTheBinding_whenTheResolverCannotResolveIt', async () => {
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));
    const resolver = { resolve: vi.fn(async () => null) } as unknown as LookupBindingResolver;

    const bindings = await resolveLookupBindings([makeMapping({})], fields, resolver);

    expect(bindings.size).toBe(0);
  });
});

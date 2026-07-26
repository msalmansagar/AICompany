import { describe, it, expect, vi } from 'vitest';
import type { FieldDefinition, FormDefinition, SubmissionMapping } from '@qdb/shared';
import { indexFieldsById, resolveLookupBindings } from './submissionLookupBindings.js';
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

  it('omitsTheBinding_whenTheResolverCannotResolveIt', async () => {
    const fields = indexFieldsById(makeForm([
      makeField({ fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account' } as never }),
    ]));
    const resolver = { resolve: vi.fn(async () => null) } as unknown as LookupBindingResolver;

    const bindings = await resolveLookupBindings([makeMapping({})], fields, resolver);

    expect(bindings.size).toBe(0);
  });
});

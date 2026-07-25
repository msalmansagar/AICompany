import { describe, it, expect } from 'vitest';
import type { FieldDefinition, FormDefinition, TabDefinition } from '@qdb/shared';
import { getAllFormFields, getAllTabFields, getTabZoneFields } from './tabFields';

function field(id: string, placement?: 'header' | 'footer' | 'body'): FieldDefinition {
  return {
    id,
    sectionId: placement && placement !== 'body' ? '' : 'sec-1',
    schemaName: id,
    label: id,
    fieldType: 'text',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    ...(placement ? { placement } : {}),
  } as FieldDefinition;
}

function tab(): TabDefinition {
  return {
    id: 'tab-1',
    formDefinitionId: 'form-1',
    label: 'Tab 1',
    displayOrder: 1,
    isVisible: true,
    requiresPreviousTabComplete: false,
    headerFields: [field('h1', 'header')],
    footerFields: [field('f1', 'footer')],
    sections: [
      {
        id: 'sec-1',
        tabId: 'tab-1',
        label: 'Section 1',
        displayOrder: 1,
        columns: 1,
        isCollapsible: false,
        isCollapsedByDefault: false,
        isVisible: true,
        fields: [field('b1'), field('b2')],
      },
    ],
  } as TabDefinition;
}

describe('tab field enumeration helpers', () => {
  it('getTabZoneFields returns only header + footer fields', () => {
    const ids = getTabZoneFields(tab()).map((f) => f.id);
    expect(ids).toEqual(['h1', 'f1']);
  });

  it('getAllTabFields returns header → body → footer in order', () => {
    const ids = getAllTabFields(tab()).map((f) => f.id);
    expect(ids).toEqual(['h1', 'b1', 'b2', 'f1']);
  });

  it('getAllFormFields flattens every zone across tabs', () => {
    const form = { tabs: [tab()] } as FormDefinition;
    expect(getAllFormFields(form).map((f) => f.id)).toEqual(['h1', 'b1', 'b2', 'f1']);
  });

  it('is safe for legacy tabs with no header/footer fields', () => {
    const legacy = { ...tab(), headerFields: undefined, footerFields: undefined } as TabDefinition;
    expect(getTabZoneFields(legacy)).toEqual([]);
    expect(getAllTabFields(legacy).map((f) => f.id)).toEqual(['b1', 'b2']);
  });
});

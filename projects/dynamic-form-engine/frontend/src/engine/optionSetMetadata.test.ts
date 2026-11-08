import { describe, it, expect } from 'vitest';
import { optionSetMetadataCast } from '@qdb/shared';

// Dataverse only expands OptionSet through the attribute's own metadata type: the Picklist
// cast answers 404 for a multi-select choice, which left those dropdowns silently empty.
describe('optionSetMetadataCast', () => {
  it('optionSetMetadataCast_picklist_returnsPicklistCast', () => {
    expect(optionSetMetadataCast('PicklistType')).toBe('Microsoft.Dynamics.CRM.PicklistAttributeMetadata');
  });

  it('optionSetMetadataCast_multiSelectPicklist_returnsMultiSelectCast', () => {
    expect(optionSetMetadataCast('MultiSelectPicklistType')).toBe('Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata');
  });

  it('optionSetMetadataCast_status_returnsStatusCast', () => {
    expect(optionSetMetadataCast('StatusType')).toBe('Microsoft.Dynamics.CRM.StatusAttributeMetadata');
  });

  it('optionSetMetadataCast_state_returnsStateCast', () => {
    expect(optionSetMetadataCast('StateType')).toBe('Microsoft.Dynamics.CRM.StateAttributeMetadata');
  });

  it('optionSetMetadataCast_textAttribute_throwsUnsupported', () => {
    expect(() => optionSetMetadataCast('StringType')).toThrow(/StringType/);
  });
});

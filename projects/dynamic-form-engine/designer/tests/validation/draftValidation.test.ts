import { describe, it, expect } from 'vitest';
import { validateForDraftSave } from '@/validation/draftValidation';
import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'tmp_form_001',
    name: 'My Draft Form',
    code: 'my_draft_form',
    description: '',
    entityLogicalName: '',
    status: 'draft',
    currentVersion: '1',
    themeId: null,
    allowSaveDraft: true,
    draftExpiryDays: null,
    showSummaryStep: false,
    powerAutomateFlowId: null,
    confirmationMessage: null,
    confirmationRecordRefAttribute: null,
    accessGroupId: null,
    createdBy: 'user-1',
    createdOn: new Date(),
    modifiedBy: 'user-1',
    modifiedOn: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('validateForDraftSave', () => {

  it('validateForDraftSave_returnsValid_whenFormHasName', () => {
    // Arrange
    const form = makeForm({ name: 'Loan Intake', code: 'loan_intake' });

    // Act
    const result = validateForDraftSave(form);

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------

  it('validateForDraftSave_returnsInvalid_whenFormNameIsEmpty', () => {
    // Arrange — name is empty string; code is valid
    const form = makeForm({ name: '', code: 'some_code' });

    // Act
    const result = validateForDraftSave(form);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.toLowerCase().includes('name'))).toBe(true);
  });

  // -------------------------------------------------------------------------

  it('validateForDraftSave_returnsInvalid_whenFormCodeIsEmpty', () => {
    // Arrange — name is valid; code is empty string
    const form = makeForm({ name: 'Valid Name', code: '' });

    // Act
    const result = validateForDraftSave(form);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.toLowerCase().includes('code'))).toBe(true);
  });

});

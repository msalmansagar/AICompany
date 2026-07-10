import { describe, it, expect } from 'vitest';
import {
  ValidationEngine,
  applyCrossFieldOperator,
  evaluateStructuredCondition,
} from './ValidationEngine';
import type { FieldDefinition, FormDefinition, ValidationRule } from '@qdb/shared';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'text',
    schemaName: 'firstName',
    label: 'First name',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    ...overrides,
  };
}

function makeRule(overrides: Partial<ValidationRule>): ValidationRule {
  return {
    id: 'r1',
    fieldId: 'field-1',
    ruleType: 'required',
    errorMessage: 'Validation failed',
    isActive: true,
    priority: 1,
    ...overrides,
  };
}

describe('ValidationEngine', () => {
  const engine = new ValidationEngine();

  describe('validateField', () => {
    it('validateField_returnsNoErrors_whenFieldIsOptionalAndEmpty', () => {
      const field = makeField({ isRequired: false });

      const errors = engine.validateField(field, '', {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsError_whenRequiredFieldIsEmpty', () => {
      const field = makeField({
        validationRules: [makeRule({ ruleType: 'required', errorMessage: 'First name is required' })],
      });

      const errors = engine.validateField(field, '', {});

      expect(errors).toContain('First name is required');
    });

    it('validateField_returnsError_whenValueExceedsMaxLength', () => {
      const field = makeField({
        validationRules: [makeRule({ ruleType: 'maxLength', maxLength: 5, errorMessage: 'Maximum 5 characters' })],
      });

      const errors = engine.validateField(field, 'toolongstring', {});

      expect(errors).toContain('Maximum 5 characters');
    });

    it('validateField_returnsError_whenEmailIsInvalid', () => {
      const field = makeField({
        fieldType: 'email',
        schemaName: 'email',
        validationRules: [makeRule({ ruleType: 'email', errorMessage: 'Invalid email address' })],
      });

      const errors = engine.validateField(field, 'not-an-email', {});

      expect(errors).toContain('Invalid email address');
    });

    it('validateField_passesValidation_whenEmailIsCorrect', () => {
      const field = makeField({
        fieldType: 'email',
        validationRules: [makeRule({ ruleType: 'email', errorMessage: 'Invalid email' })],
      });

      const errors = engine.validateField(field, 'user@example.com', {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsError_whenBelowMinValue', () => {
      const field = makeField({
        fieldType: 'number',
        validationRules: [makeRule({ ruleType: 'minValue', minValue: 18, errorMessage: 'Must be at least 18' })],
      });

      const errors = engine.validateField(field, 15, {});

      expect(errors).toContain('Must be at least 18');
    });

    it('validateField_skipsInactiveRule', () => {
      const field = makeField({
        validationRules: [makeRule({ ruleType: 'required', errorMessage: 'Required', isActive: false })],
      });

      const errors = engine.validateField(field, '', {});

      expect(errors).toHaveLength(0);
    });
  });

  // ── DFE-ENH-001 FR-006: conditionalRequired ────────────────────────────────

  describe('conditionalRequired (FR-006)', () => {
    it('validateField_raisesError_whenConditionIsTrueAndFieldIsEmpty', () => {
      // Condition: loan_type equals 'secured'. When true, guarantor_name must be non-empty.
      const field = makeField({
        schemaName: 'guarantor_name',
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Guarantor name is required for secured loans',
            conditions: [{ fieldRef: 'loan_type', operator: 'equals', value: 'secured' }],
          }),
        ],
      });

      const errors = engine.validateField(field, '', { loan_type: 'secured' });

      expect(errors).toContain('Guarantor name is required for secured loans');
    });

    it('validateField_raisesNoError_whenConditionIsFalseAndFieldIsEmpty', () => {
      const field = makeField({
        schemaName: 'guarantor_name',
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Guarantor name is required for secured loans',
            conditions: [{ fieldRef: 'loan_type', operator: 'equals', value: 'secured' }],
          }),
        ],
      });

      // Loan type is unsecured — condition is false — no error expected
      const errors = engine.validateField(field, '', { loan_type: 'unsecured' });

      expect(errors).toHaveLength(0);
    });

    it('validateField_raisesNoError_whenConditionIsTrueButFieldHasValue', () => {
      const field = makeField({
        schemaName: 'guarantor_name',
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Guarantor name is required for secured loans',
            conditions: [{ fieldRef: 'loan_type', operator: 'equals', value: 'secured' }],
          }),
        ],
      });

      const errors = engine.validateField(field, 'John Smith', { loan_type: 'secured' });

      expect(errors).toHaveLength(0);
    });

    it('validateField_evaluatesAllConditions_withANDsemantics', () => {
      // Both conditions must be true for the field to become required
      const field = makeField({
        schemaName: 'collateral_details',
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Collateral details required',
            conditions: [
              { fieldRef: 'loan_type', operator: 'equals', value: 'secured' },
              { fieldRef: 'loan_amount', operator: 'greater_than', value: '10000' },
            ],
          }),
        ],
      });

      // Only first condition true — should NOT require the field
      const errorsWhenOnlyFirstTrue = engine.validateField(
        field,
        '',
        { loan_type: 'secured', loan_amount: '5000' },
      );
      expect(errorsWhenOnlyFirstTrue).toHaveLength(0);

      // Both conditions true — SHOULD require the field
      const errorsWhenBothTrue = engine.validateField(
        field,
        '',
        { loan_type: 'secured', loan_amount: '50000' },
      );
      expect(errorsWhenBothTrue).toContain('Collateral details required');
    });

    it('validateField_isEmpty_operatorWorksCorrectly', () => {
      const field = makeField({
        schemaName: 'extra_comment',
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Extra comment required when remarks are empty',
            conditions: [{ fieldRef: 'remarks', operator: 'is_empty', value: null }],
          }),
        ],
      });

      const errors = engine.validateField(field, '', { remarks: '' });

      expect(errors).toContain('Extra comment required when remarks are empty');
    });

    it('validateField_raisesNoError_whenConditionsArrayIsEmpty', () => {
      const field = makeField({
        validationRules: [
          makeRule({
            ruleType: 'conditionalRequired',
            errorMessage: 'Required',
            conditions: [],
          }),
        ],
      });

      const errors = engine.validateField(field, '', {});

      expect(errors).toHaveLength(0);
    });
  });

  // ── DFE-ENH-001 FR-007: crossField ────────────────────────────────────────

  describe('crossField (FR-007)', () => {
    it('validateField_raisesError_whenCrossFieldEqualityFails', () => {
      const field = makeField({
        schemaName: 'confirm_email',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Email addresses must match',
            crossFieldOperator: '==',
            crossFieldTargetRef: 'email',
          }),
        ],
      });

      const errors = engine.validateField(field, 'a@a.com', { email: 'b@b.com' });

      expect(errors).toContain('Email addresses must match');
    });

    it('validateField_raisesNoError_whenCrossFieldEqualityPasses', () => {
      const field = makeField({
        schemaName: 'confirm_email',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Email addresses must match',
            crossFieldOperator: '==',
            crossFieldTargetRef: 'email',
          }),
        ],
      });

      const errors = engine.validateField(field, 'same@same.com', { email: 'same@same.com' });

      expect(errors).toHaveLength(0);
    });

    it('validateField_raisesError_whenEndDateNotAfterStartDate', () => {
      // Rule on end_date: end_date > start_date (i.e., source must be > target)
      const field = makeField({
        schemaName: 'end_date',
        fieldType: 'date',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'End date must be after start date',
            crossFieldOperator: '>',
            crossFieldTargetRef: 'start_date',
          }),
        ],
      });

      // end_date (2026-01-01) is NOT greater than start_date (2026-06-01)
      const errors = engine.validateField(
        field,
        '2026-01-01',
        { start_date: '2026-06-01' },
      );

      expect(errors).toContain('End date must be after start date');
    });

    it('validateField_raisesNoError_whenEndDateIsAfterStartDate', () => {
      const field = makeField({
        schemaName: 'end_date',
        fieldType: 'date',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'End date must be after start date',
            crossFieldOperator: '>',
            crossFieldTargetRef: 'start_date',
          }),
        ],
      });

      const errors = engine.validateField(
        field,
        '2026-12-31',
        { start_date: '2026-06-01' },
      );

      expect(errors).toHaveLength(0);
    });

    it('validateField_raisesError_whenLoanAmountExceedsCreditLimit', () => {
      // Loan amount must be <= credit limit
      const field = makeField({
        schemaName: 'loan_amount',
        fieldType: 'number',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Loan amount cannot exceed credit limit',
            crossFieldOperator: '<=',
            crossFieldTargetRef: 'credit_limit',
          }),
        ],
      });

      const errors = engine.validateField(
        field,
        150000,
        { credit_limit: 100000 },
      );

      expect(errors).toContain('Loan amount cannot exceed credit limit');
    });

    it('validateField_raisesNoError_whenLoanAmountIsWithinCreditLimit', () => {
      const field = makeField({
        schemaName: 'loan_amount',
        fieldType: 'number',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Loan amount cannot exceed credit limit',
            crossFieldOperator: '<=',
            crossFieldTargetRef: 'credit_limit',
          }),
        ],
      });

      const errors = engine.validateField(
        field,
        75000,
        { credit_limit: 100000 },
      );

      expect(errors).toHaveLength(0);
    });

    it('validateField_raisesError_whenNotEqualsCrossFieldFails', () => {
      const field = makeField({
        schemaName: 'secondary_contact',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Secondary contact must differ from primary contact',
            crossFieldOperator: '!=',
            crossFieldTargetRef: 'primary_contact',
          }),
        ],
      });

      const errors = engine.validateField(
        field,
        'alice@acme.com',
        { primary_contact: 'alice@acme.com' },
      );

      expect(errors).toContain('Secondary contact must differ from primary contact');
    });

    it('validateField_usesLegacyCompareToFieldId_whenCrossFieldRefAbsent', () => {
      // Backward-compat: legacy records use compareToFieldId with equality semantics
      const field = makeField({
        schemaName: 'confirm_password',
        validationRules: [
          makeRule({
            ruleType: 'crossField',
            errorMessage: 'Passwords must match',
            compareToFieldId: 'password',
            crossFieldOperator: undefined,
            crossFieldTargetRef: undefined,
          }),
        ],
      });

      const errors = engine.validateField(
        field,
        'hunter2',
        { password: 'different' },
      );

      expect(errors).toContain('Passwords must match');
    });
  });

  describe('validateForm', () => {
    it('validateForm_returnsErrorsOnlyForVisibleFields', () => {
      const hiddenField = makeField({
        id: 'field-hidden',
        schemaName: 'hiddenField',
        isVisible: false,
        validationRules: [
          makeRule({ fieldId: 'field-hidden', ruleType: 'required', errorMessage: 'Hidden required' }),
        ],
      });

      const formDef: FormDefinition = {
        id: 'form-1',
        formCode: 'test',
        title: 'Test',
        status: 'active',
        version: 1,
        allowSaveDraft: true,
        draftExpiryDays: 7,
        showSummaryStep: false,
        confirmationMessage: 'Done',
        allowInfocardSkip: false,
        infocardCountsInProgress: false,
        infoCards: [],
        submissionMappings: [],
        buttons: [],
        createdAt: '',
        modifiedAt: '',
        tabs: [
          {
            id: 'tab-1',
            formDefinitionId: 'form-1',
            label: 'Tab 1',
            displayOrder: 1,
            isVisible: true,
            requiresPreviousTabComplete: false,
            sections: [
              {
                id: 'section-1',
                tabId: 'tab-1',
                label: 'Section 1',
                displayOrder: 1,
                columns: 1,
                isCollapsible: false,
                isCollapsedByDefault: false,
                isVisible: true,
                fields: [hiddenField],
              },
            ],
          },
        ],
      };

      const visibleFields = new Set<string>();

      const errors = engine.validateForm(formDef, {}, visibleFields);

      expect(errors['field-hidden']).toBeUndefined();
    });
  });

  describe('buildZodSchema', () => {
    it('buildZodSchema_excludesHiddenFields_fromSchema', () => {
      const visibleField = makeField({ id: 'field-visible', schemaName: 'name' });
      const hiddenField = makeField({ id: 'field-hidden', schemaName: 'secret' });

      const schema = engine.buildZodSchema(
        [visibleField, hiddenField],
        new Set(['field-visible']),
      );

      const shape = schema.shape;
      expect('name' in shape).toBe(true);
      expect('secret' in shape).toBe(false);
    });
  });

  describe('boolean field validation', () => {
    it('validateField_returnsNoError_whenBooleanIsFalse_andRequired', () => {
      const field = makeField({ fieldType: 'boolean', isRequired: true });

      const errors = engine.validateField(field, false, {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsError_whenBooleanIsUndefined_andRequired', () => {
      const field = makeField({ fieldType: 'boolean', isRequired: true });

      const errors = engine.validateField(field, undefined, {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsNoError_whenBooleanIsTrue_andRequired', () => {
      const field = makeField({ fieldType: 'boolean', isRequired: true });

      const errors = engine.validateField(field, true, {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsNoError_whenBooleanIsOptionalAndUndefined', () => {
      const field = makeField({ fieldType: 'boolean', isRequired: false });

      const errors = engine.validateField(field, undefined, {});

      expect(errors).toHaveLength(0);
    });
  });

  describe('interactive-grid field validation', () => {
    it('validateField_returnsError_whenSelectionGridIsRequired_andEmpty', () => {
      const field = makeField({ fieldType: 'interactive-grid', isRequired: true });

      const errors = engine.validateField(field, [], {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsError_whenSelectionGridIsRequired_andUndefined', () => {
      const field = makeField({ fieldType: 'interactive-grid', isRequired: true });

      const errors = engine.validateField(field, undefined, {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsNoError_whenSelectionGridHasValue', () => {
      const field = makeField({ fieldType: 'interactive-grid', isRequired: true });

      const errors = engine.validateField(field, '00000000-0000-0000-0000-000000000001', {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsNoError_whenEntryGridHasRows', () => {
      const field = makeField({ fieldType: 'interactive-grid', isRequired: true });

      const errors = engine.validateField(field, [{ qdb_name: 'Row 1' }], {});

      expect(errors).toHaveLength(0);
    });
  });
});

// ── Unit tests for pure helper functions ───────────────────────────────────────

describe('applyCrossFieldOperator', () => {
  it('applyCrossFieldOperator_returnsTrue_whenNumericEquality', () => {
    expect(applyCrossFieldOperator(100, 100, '==')).toBe(true);
  });

  it('applyCrossFieldOperator_returnsFalse_whenNumericInequalityButEqualOp', () => {
    expect(applyCrossFieldOperator(50, 100, '==')).toBe(false);
  });

  it('applyCrossFieldOperator_returnsTrue_whenDateGreaterThan', () => {
    expect(applyCrossFieldOperator('2026-12-31', '2026-01-01', '>')).toBe(true);
  });

  it('applyCrossFieldOperator_returnsFalse_whenDateNotGreaterThan', () => {
    expect(applyCrossFieldOperator('2026-01-01', '2026-12-31', '>')).toBe(false);
  });

  it('applyCrossFieldOperator_returnsTrue_whenStringEquality', () => {
    expect(applyCrossFieldOperator('abc', 'abc', '==')).toBe(true);
  });

  it('applyCrossFieldOperator_returnsTrue_whenSourceIsNull', () => {
    // Null source means no value to compare — treat as passing
    expect(applyCrossFieldOperator(null, 100, '<=')).toBe(true);
  });

  it('applyCrossFieldOperator_returnsTrue_whenTargetIsNull', () => {
    expect(applyCrossFieldOperator(50, null, '<=')).toBe(true);
  });
});

describe('evaluateStructuredCondition', () => {
  it('evaluateStructuredCondition_returnsTrue_forEquals_whenValuesMatch', () => {
    const condition = { fieldRef: 'loan_type', operator: 'equals' as const, value: 'secured' };
    expect(evaluateStructuredCondition(condition, { loan_type: 'secured' })).toBe(true);
  });

  it('evaluateStructuredCondition_returnsFalse_forEquals_whenValuesDiffer', () => {
    const condition = { fieldRef: 'loan_type', operator: 'equals' as const, value: 'secured' };
    expect(evaluateStructuredCondition(condition, { loan_type: 'unsecured' })).toBe(false);
  });

  it('evaluateStructuredCondition_returnsTrue_forIsEmpty_whenFieldEmpty', () => {
    const condition = { fieldRef: 'remarks', operator: 'is_empty' as const, value: null };
    expect(evaluateStructuredCondition(condition, { remarks: '' })).toBe(true);
  });

  it('evaluateStructuredCondition_returnsFalse_forIsEmpty_whenFieldHasValue', () => {
    const condition = { fieldRef: 'remarks', operator: 'is_empty' as const, value: null };
    expect(evaluateStructuredCondition(condition, { remarks: 'some text' })).toBe(false);
  });

  it('evaluateStructuredCondition_returnsTrue_forGreaterThan_whenValueExceeds', () => {
    const condition = { fieldRef: 'amount', operator: 'greater_than' as const, value: '10000' };
    expect(evaluateStructuredCondition(condition, { amount: '50000' })).toBe(true);
  });

  it('evaluateStructuredCondition_returnsFalse_forGreaterThan_whenValueBelow', () => {
    const condition = { fieldRef: 'amount', operator: 'greater_than' as const, value: '10000' };
    expect(evaluateStructuredCondition(condition, { amount: '5000' })).toBe(false);
  });
});

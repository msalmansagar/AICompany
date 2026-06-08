// RED â€” failing until ValidationEngine is wired correctly
import { describe, it, expect } from 'vitest';
import { ValidationEngine } from './ValidationEngine';
import type { FieldDefinition, FormDefinition } from '@qdb/shared';

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
        validationRules: [
          {
            id: 'r1',
            fieldId: 'field-1',
            ruleType: 'required',
            errorMessage: 'First name is required',
            isActive: true,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, '', {});

      expect(errors).toContain('First name is required');
    });

    it('validateField_returnsError_whenValueExceedsMaxLength', () => {
      const field = makeField({
        validationRules: [
          {
            id: 'r2',
            fieldId: 'field-1',
            ruleType: 'maxLength',
            maxLength: 5,
            errorMessage: 'Maximum 5 characters',
            isActive: true,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, 'toolongstring', {});

      expect(errors).toContain('Maximum 5 characters');
    });

    it('validateField_returnsError_whenEmailIsInvalid', () => {
      const field = makeField({
        fieldType: 'email',
        schemaName: 'email',
        validationRules: [
          {
            id: 'r3',
            fieldId: 'field-1',
            ruleType: 'email',
            errorMessage: 'Invalid email address',
            isActive: true,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, 'not-an-email', {});

      expect(errors).toContain('Invalid email address');
    });

    it('validateField_passesValidation_whenEmailIsCorrect', () => {
      const field = makeField({
        fieldType: 'email',
        validationRules: [
          {
            id: 'r4',
            fieldId: 'field-1',
            ruleType: 'email',
            errorMessage: 'Invalid email',
            isActive: true,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, 'user@example.com', {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsError_whenBelowMinValue', () => {
      const field = makeField({
        fieldType: 'number',
        validationRules: [
          {
            id: 'r5',
            fieldId: 'field-1',
            ruleType: 'minValue',
            minValue: 18,
            errorMessage: 'Must be at least 18',
            isActive: true,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, 15, {});

      expect(errors).toContain('Must be at least 18');
    });

    it('validateField_skipsInactiveRule', () => {
      const field = makeField({
        validationRules: [
          {
            id: 'r6',
            fieldId: 'field-1',
            ruleType: 'required',
            errorMessage: 'Required',
            isActive: false,
            priority: 1,
          },
        ],
      });

      const errors = engine.validateField(field, '', {});

      expect(errors).toHaveLength(0);
    });
  });

  describe('validateForm', () => {
    it('validateForm_returnsErrorsOnlyForVisibleFields', () => {
      const hiddenField = makeField({
        id: 'field-hidden',
        schemaName: 'hiddenField',
        isVisible: false,
        validationRules: [
          {
            id: 'r7',
            fieldId: 'field-hidden',
            ruleType: 'required',
            errorMessage: 'Hidden required',
            isActive: true,
            priority: 1,
          },
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

      const visibleFields = new Set<string>(); // field-hidden NOT in set

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

  // DFE-ADD-002: Boolean field validation (BC-010).
  describe('boolean field validation', () => {
    it('validateField_returnsNoError_whenBooleanIsFalse_andRequired', () => {
      // Boolean false is a valid answer — it is not "empty".
      const field = makeField({
        fieldType: 'boolean',
        isRequired: true,
      });

      const errors = engine.validateField(field, false, {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsError_whenBooleanIsUndefined_andRequired', () => {
      const field = makeField({
        fieldType: 'boolean',
        isRequired: true,
      });

      const errors = engine.validateField(field, undefined, {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsNoError_whenBooleanIsTrue_andRequired', () => {
      const field = makeField({
        fieldType: 'boolean',
        isRequired: true,
      });

      const errors = engine.validateField(field, true, {});

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsNoError_whenBooleanIsOptionalAndUndefined', () => {
      const field = makeField({ fieldType: 'boolean', isRequired: false });

      const errors = engine.validateField(field, undefined, {});

      expect(errors).toHaveLength(0);
    });
  });

  // DFE-ADD-002: Interactive Grid validation (BC-010).
  describe('interactive-grid field validation', () => {
    it('validateField_returnsError_whenSelectionGridIsRequired_andEmpty', () => {
      const field = makeField({
        fieldType: 'interactive-grid',
        isRequired: true,
      });

      // Empty array = no selection made.
      const errors = engine.validateField(field, [], {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsError_whenSelectionGridIsRequired_andUndefined', () => {
      const field = makeField({
        fieldType: 'interactive-grid',
        isRequired: true,
      });

      const errors = engine.validateField(field, undefined, {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('validateField_returnsNoError_whenSelectionGridHasValue', () => {
      const field = makeField({
        fieldType: 'interactive-grid',
        isRequired: true,
      });

      // A selected GUID string.
      const errors = engine.validateField(
        field,
        '00000000-0000-0000-0000-000000000001',
        {},
      );

      expect(errors).toHaveLength(0);
    });

    it('validateField_returnsNoError_whenEntryGridHasRows', () => {
      const field = makeField({
        fieldType: 'interactive-grid',
        isRequired: true,
      });

      const errors = engine.validateField(
        field,
        [{ qdb_name: 'Row 1' }],
        {},
      );

      expect(errors).toHaveLength(0);
    });
  });
});

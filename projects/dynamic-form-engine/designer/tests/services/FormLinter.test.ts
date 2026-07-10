// RED → GREEN: FormLinter unit tests.
// Each describe block covers one lint rule.
// AAA pattern throughout: Arrange → Act → Assert.
// No Zustand, no DOM — pure TypeScript inputs and typed outputs.

import { describe, it, expect } from 'vitest';
import { FormLinter } from '@/services/FormLinter';
import type { FormLinterInput, CrmAttributeCache } from '@/services/FormLinter';
import type { DesignerFieldModel, DesignerTabModel, DesignerSectionModel } from '@/state/models/DesignerFormModel';
import type { DesignerValidationRule, DesignerBusinessRule, ValidationRuleType } from '@/state/models/DesignerRuleModel';
import type { SubmissionMapping } from '@/services/SubmissionMappingService';

// ─── Test factories ───────────────────────────────────────────────────────────

function makeField(overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    label: 'Full Name',
    code: 'full_name',
    fieldType: 'text',
    placeholder: '',
    helpText: '',
    isRequired: false,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    currencyCode: null,
    decimalPlaces: null,
    maxRows: null,
    sortOrder: 0,
    columnSpan: 1,
    options: [],
    lookupConfig: null,
    componentKey: null,
    boolRenderStyle: null,
    trueLabel: null,
    falseLabel: null,
    infoCardStyle: null,
    infoCardTitle: null,
    infoCardBody: null,
    infoCardIcon: null,
    infoCardDownloadUrl: null,
    infoCardDownloadLabel: null,
    infoCardDownloadIcon: null,
    fileDownloadLabel: null,
    fileDownloadIcon: null,
    uploadDocumentSetting: null,
    downloadDocumentSetting: null,
    prefix: null,
    suffix: null,
    gridMode: null,
    gridEntityName: null,
    gridSelectionMode: null,
    gridMinRows: null,
    gridSavedViewId: null,
    gridFilterExpression: null,
    gridDependsOnFieldId: null,
    gridDependsOnFilterTemplate: null,
    gridColumns: [],
    ...overrides,
  };
}

function makeTab(overrides: Partial<DesignerTabModel> = {}): DesignerTabModel {
  return {
    id: 'tab-1',
    formId: 'form-1',
    label: 'Personal Details',
    iconName: null,
    sortOrder: 0,
    isVisible: true,
    requiresPreviousTabComplete: false,
    hideTabBar: false,
    ...overrides,
  };
}

function makeSection(overrides: Partial<DesignerSectionModel> = {}): DesignerSectionModel {
  return {
    id: 'section-1',
    tabId: 'tab-1',
    label: 'Basic Info',
    description: null,
    columnCount: 1,
    isCollapsible: false,
    isExpandedByDefault: true,
    isVisible: true,
    sortOrder: 0,
    ...overrides,
  };
}

function makeValidationRule(overrides: Partial<DesignerValidationRule> = {}): DesignerValidationRule {
  return {
    id: 'vrule-1',
    fieldId: 'field-1',
    ruleType: 'required',
    ruleValue: null,
    errorMessage: 'This field is required',
    sortOrder: 1,
    customExpression: null,
    ruleTemplateId: null,
    ...overrides,
  };
}

function makeBusinessRule(overrides: Partial<DesignerBusinessRule> = {}): DesignerBusinessRule {
  return {
    id: 'brule-1',
    formId: 'form-1',
    name: 'Show Guarantor Section',
    isActive: true,
    sortOrder: 1,
    definition: {
      version: '1.0',
      trigger_field_code: 'loan_type',
      trigger_event: 'on_change',
      condition_group: {
        logical_operator: 'AND',
        conditions: [{ field_code: 'loan_type', operator: 'equals', value: 'secured' }],
      },
      actions: [{ action_type: 'show_field', target_field_code: 'guarantor_name' }],
    },
    ...overrides,
  };
}

function makeMapping(overrides: Partial<SubmissionMapping> = {}): SubmissionMapping {
  return {
    id: 'mapping-1',
    formId: 'form-1',
    fieldId: 'field-1',
    targetEntity: 'contact',
    targetAttribute: 'firstname',
    isChildEntity: false,
    childEntityRelationshipName: null,
    transformExpression: null,
    isActive: true,
    ...overrides,
  };
}

function makeCrmAttributeCache(attrs: string[] = ['firstname', 'lastname']): CrmAttributeCache {
  return { entityName: 'contact', attributes: attrs, fetchedAt: new Date() };
}

/** Builds a minimal clean FormLinterInput that passes all lint rules. */
function makeCleanInput(overrides: Partial<FormLinterInput> = {}): FormLinterInput {
  const tab = makeTab();
  const section = makeSection();
  const field = makeField({ id: 'field-1', code: 'full_name', sectionId: 'section-1' });

  return {
    fields: { 'field-1': field },
    tabs: { 'tab-1': tab },
    sections: { 'section-1': section },
    validationRules: {},
    businessRules: {},
    tabOrder: ['tab-1'],
    sectionOrder: { 'tab-1': ['section-1'] },
    fieldOrder: { 'section-1': ['field-1'] },
    submissionMappings: [],
    crmAttributeCache: undefined,
    ...overrides,
  };
}

/** Generates N fields with unique IDs and codes, all in section-1. */
function generateFields(count: number): Record<string, DesignerFieldModel> {
  const result: Record<string, DesignerFieldModel> = {};
  for (let i = 0; i < count; i++) {
    const id = `field-gen-${i}`;
    result[id] = makeField({ id, code: `field_code_${i}`, sectionId: 'section-1' });
  }
  return result;
}

/** Generates N business rules with unique IDs; all reference existing field codes. */
function generateBusinessRules(
  count: number,
  validTriggerCode: string
): Record<string, DesignerBusinessRule> {
  const result: Record<string, DesignerBusinessRule> = {};
  for (let i = 0; i < count; i++) {
    const id = `brule-gen-${i}`;
    result[id] = makeBusinessRule({
      id,
      name: `Generated Rule ${i}`,
      definition: {
        version: '1.0',
        trigger_field_code: validTriggerCode,
        trigger_event: 'on_change',
        condition_group: { logical_operator: 'AND', conditions: [] },
        actions: [],
      },
    });
  }
  return result;
}

// ─── L001 — Duplicate field codes ─────────────────────────────────────────────

describe('FormLinter — L001 duplicate field codes', () => {
  it('checkDuplicateFieldCodes_returnsNoFindings_whenAllCodesAreUnique', () => {
    // Arrange
    const input = makeCleanInput({
      fields: {
        'field-1': makeField({ id: 'field-1', code: 'first_name' }),
        'field-2': makeField({ id: 'field-2', code: 'last_name' }),
      },
    });

    // Act
    const findings = FormLinter.checkDuplicateFieldCodes(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkDuplicateFieldCodes_returnsErrorForEachDuplicate_whenTwoFieldsShareCode', () => {
    // Arrange
    const input = makeCleanInput({
      fields: {
        'field-1': makeField({ id: 'field-1', code: 'duplicate_code' }),
        'field-2': makeField({ id: 'field-2', code: 'duplicate_code' }),
      },
    });

    // Act
    const findings = FormLinter.checkDuplicateFieldCodes(input);

    // Assert — both fields are flagged so the author can navigate to either
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.severity === 'error')).toBe(true);
    expect(findings.every(f => f.code === 'L001')).toBe(true);
    expect(findings.every(f => f.nodeType === 'field')).toBe(true);
    expect(findings.map(f => f.nodeId)).toContain('field-1');
    expect(findings.map(f => f.nodeId)).toContain('field-2');
  });

  it('checkDuplicateFieldCodes_ignoresEmptyCodes_toAvoidFalsePositives', () => {
    // Arrange — fields with empty codes are caught by PV-007; L001 must not flag them
    const input = makeCleanInput({
      fields: {
        'field-1': makeField({ id: 'field-1', code: '' }),
        'field-2': makeField({ id: 'field-2', code: '' }),
      },
    });

    // Act
    const findings = FormLinter.checkDuplicateFieldCodes(input);

    // Assert
    expect(findings).toHaveLength(0);
  });
});

// ─── L002 — Required field without mapping ─────────────────────────────────────

describe('FormLinter — L002 required field without mapping', () => {
  it('checkRequiredFieldsWithoutMapping_returnsNoFindings_whenRequiredFieldHasMapping', () => {
    // Arrange
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', code: 'email', isRequired: true }) },
      submissionMappings: [makeMapping({ fieldId: 'field-1' })],
    });

    // Act
    const findings = FormLinter.checkRequiredFieldsWithoutMapping(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkRequiredFieldsWithoutMapping_returnsWarning_whenRequiredFieldHasNoMapping', () => {
    // Arrange
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', code: 'email', isRequired: true, label: 'Email Address' }) },
      submissionMappings: [],
    });

    // Act
    const findings = FormLinter.checkRequiredFieldsWithoutMapping(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].code).toBe('L002');
    expect(findings[0].nodeType).toBe('field');
    expect(findings[0].nodeId).toBe('field-1');
    expect(findings[0].message).toContain('Email Address');
  });

  it('checkRequiredFieldsWithoutMapping_returnsNoFindings_forNonRequiredField', () => {
    // Arrange
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', isRequired: false }) },
    });

    // Act
    const findings = FormLinter.checkRequiredFieldsWithoutMapping(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkRequiredFieldsWithoutMapping_exempts_fieldsWithConditionalRequiredRule', () => {
    // Arrange — field is required but also has a conditional_required rule: exempt from L002 (L007 applies)
    const conditionalRule = makeValidationRule({
      id: 'vrule-1',
      fieldId: 'field-1',
      ruleType: 'conditional_required' as ValidationRuleType,
    });
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', isRequired: true }) },
      validationRules: { 'vrule-1': conditionalRule },
      submissionMappings: [],
    });

    // Act
    const findings = FormLinter.checkRequiredFieldsWithoutMapping(input);

    // Assert — L002 does not fire; L007 would fire instead
    expect(findings.filter(f => f.code === 'L002')).toHaveLength(0);
  });
});

// ─── L003 — Orphaned submission mapping ───────────────────────────────────────

describe('FormLinter — L003 orphaned submission mapping', () => {
  it('checkOrphanedSubmissionMappings_returnsNoFindings_whenCacheIsAbsent', () => {
    // Arrange — no cache means we cannot validate attributes; skip silently
    const input = makeCleanInput({
      submissionMappings: [makeMapping({ targetAttribute: 'nonexistent_attr' })],
      crmAttributeCache: undefined,
    });

    // Act
    const findings = FormLinter.checkOrphanedSubmissionMappings(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkOrphanedSubmissionMappings_returnsNoFindings_whenAttributeExistsInCache', () => {
    // Arrange
    const input = makeCleanInput({
      submissionMappings: [makeMapping({ targetAttribute: 'firstname' })],
      crmAttributeCache: makeCrmAttributeCache(['firstname', 'lastname']),
    });

    // Act
    const findings = FormLinter.checkOrphanedSubmissionMappings(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkOrphanedSubmissionMappings_returnsWarning_whenAttributeMissingFromCache', () => {
    // Arrange
    const input = makeCleanInput({
      submissionMappings: [makeMapping({ id: 'mapping-1', targetAttribute: 'qdb_loanamount' })],
      crmAttributeCache: makeCrmAttributeCache(['firstname', 'lastname']),
    });

    // Act
    const findings = FormLinter.checkOrphanedSubmissionMappings(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].code).toBe('L003');
    expect(findings[0].nodeType).toBe('mapping');
    expect(findings[0].nodeId).toBe('mapping-1');
    expect(findings[0].message).toContain('qdb_loanamount');
  });
});

// ─── L004 — Orphaned validation rule reference ────────────────────────────────

describe('FormLinter — L004 orphaned validation rule reference', () => {
  it('checkOrphanedValidationRuleReferences_returnsNoFindings_whenFieldExists', () => {
    // Arrange
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1' }) },
      validationRules: { 'vrule-1': makeValidationRule({ fieldId: 'field-1' }) },
    });

    // Act
    const findings = FormLinter.checkOrphanedValidationRuleReferences(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkOrphanedValidationRuleReferences_returnsError_whenFieldWasDeleted', () => {
    // Arrange — rule references a field that no longer exists in the form
    const input = makeCleanInput({
      fields: {},
      validationRules: { 'vrule-1': makeValidationRule({ id: 'vrule-1', fieldId: 'deleted-field-id' }) },
    });

    // Act
    const findings = FormLinter.checkOrphanedValidationRuleReferences(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].code).toBe('L004');
    expect(findings[0].nodeType).toBe('rule');
    expect(findings[0].nodeId).toBe('vrule-1');
  });
});

// ─── L005 — Orphaned business rule reference ──────────────────────────────────

describe('FormLinter — L005 orphaned business rule reference', () => {
  it('checkOrphanedBusinessRuleReferences_returnsNoFindings_whenAllCodesExist', () => {
    // Arrange — form has both fields that the rule references
    const input = makeCleanInput({
      fields: {
        'field-1': makeField({ id: 'field-1', code: 'loan_type' }),
        'field-2': makeField({ id: 'field-2', code: 'guarantor_name' }),
      },
      businessRules: { 'brule-1': makeBusinessRule() },
    });

    // Act
    const findings = FormLinter.checkOrphanedBusinessRuleReferences(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkOrphanedBusinessRuleReferences_returnsError_whenTriggerFieldCodeIsMissing', () => {
    // Arrange — loan_type was deleted; guarantor_name still exists
    const input = makeCleanInput({
      fields: { 'field-2': makeField({ id: 'field-2', code: 'guarantor_name' }) },
      businessRules: { 'brule-1': makeBusinessRule() },
    });

    // Act
    const findings = FormLinter.checkOrphanedBusinessRuleReferences(input);

    // Assert
    const l005findings = findings.filter(f => f.code === 'L005');
    expect(l005findings.length).toBeGreaterThanOrEqual(1);
    expect(l005findings.every(f => f.severity === 'error')).toBe(true);
    expect(l005findings.every(f => f.nodeType === 'rule')).toBe(true);
    expect(l005findings.every(f => f.nodeId === 'brule-1')).toBe(true);
    expect(l005findings.some(f => f.message.includes('loan_type'))).toBe(true);
  });

  it('checkOrphanedBusinessRuleReferences_returnsError_whenActionTargetFieldCodeIsMissing', () => {
    // Arrange — loan_type exists but guarantor_name was deleted
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', code: 'loan_type' }) },
      businessRules: { 'brule-1': makeBusinessRule() },
    });

    // Act
    const findings = FormLinter.checkOrphanedBusinessRuleReferences(input);

    // Assert
    const l005findings = findings.filter(f => f.code === 'L005');
    expect(l005findings.some(f => f.message.includes('guarantor_name'))).toBe(true);
  });

  it('checkOrphanedBusinessRuleReferences_deduplicatesOrphanedCodes_perRule', () => {
    // Arrange — trigger and condition reference the same missing code; should yield one finding for it
    const rule = makeBusinessRule({
      definition: {
        version: '1.0',
        trigger_field_code: 'missing_code',
        trigger_event: 'on_change',
        condition_group: {
          logical_operator: 'AND',
          conditions: [{ field_code: 'missing_code', operator: 'equals', value: 'x' }],
        },
        actions: [],
      },
    });
    const input = makeCleanInput({ fields: {}, businessRules: { 'brule-1': rule } });

    // Act
    const findings = FormLinter.checkOrphanedBusinessRuleReferences(input);

    // Assert — deduplicated: one finding for the one unique missing code
    const l005findings = findings.filter(f => f.code === 'L005');
    expect(l005findings).toHaveLength(1);
  });
});

// ─── L006 — Empty containers ──────────────────────────────────────────────────

describe('FormLinter — L006 empty containers', () => {
  it('checkEmptyContainers_returnsNoFindings_whenTabHasSectionsAndSectionHasFields', () => {
    // Arrange
    const input = makeCleanInput();

    // Act
    const findings = FormLinter.checkEmptyContainers(input);

    // Assert
    expect(findings).toHaveLength(0);
  });

  it('checkEmptyContainers_returnsInfo_whenTabHasNoSections', () => {
    // Arrange
    const tab = makeTab({ id: 'tab-1', label: 'Empty Tab' });
    const input = makeCleanInput({
      tabs: { 'tab-1': tab },
      sections: {},
      fields: {},
      sectionOrder: { 'tab-1': [] },
      fieldOrder: {},
    });

    // Act
    const findings = FormLinter.checkEmptyContainers(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].code).toBe('L006');
    expect(findings[0].nodeType).toBe('tab');
    expect(findings[0].nodeId).toBe('tab-1');
    expect(findings[0].message).toContain('Empty Tab');
  });

  it('checkEmptyContainers_returnsInfo_whenSectionHasNoFields', () => {
    // Arrange
    const section = makeSection({ id: 'section-1', label: 'Empty Section', tabId: 'tab-1' });
    const input = makeCleanInput({
      sections: { 'section-1': section },
      fields: {},
      sectionOrder: { 'tab-1': ['section-1'] },
      fieldOrder: { 'section-1': [] },
    });

    // Act
    const findings = FormLinter.checkEmptyContainers(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].code).toBe('L006');
    expect(findings[0].nodeType).toBe('section');
    expect(findings[0].nodeId).toBe('section-1');
    expect(findings[0].message).toContain('Empty Section');
  });
});

// ─── L007 — Conditional-required field without mapping (pre-wired) ────────────

describe('FormLinter — L007 conditional-required without mapping (pre-wired)', () => {
  it('checkConditionalRequiredWithoutMapping_returnsNoFindings_whenNoConditionalRequiredRules', () => {
    // Arrange — no conditional_required rules in current model
    const input = makeCleanInput();

    // Act
    const findings = FormLinter.checkConditionalRequiredWithoutMapping(input);

    // Assert — dormant: no findings until Phase 1 adds the rule type
    expect(findings).toHaveLength(0);
  });

  it('checkConditionalRequiredWithoutMapping_returnsWarning_whenRuleExistsWithoutMapping', () => {
    // Arrange — simulate Phase 1 extension by casting the rule type
    const conditionalRule = makeValidationRule({
      id: 'vrule-1',
      fieldId: 'field-1',
      ruleType: 'conditional_required' as ValidationRuleType,
    });
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1', label: 'Guarantor Name' }) },
      validationRules: { 'vrule-1': conditionalRule },
      submissionMappings: [],
    });

    // Act
    const findings = FormLinter.checkConditionalRequiredWithoutMapping(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].code).toBe('L007');
    expect(findings[0].nodeType).toBe('field');
    expect(findings[0].nodeId).toBe('field-1');
    expect(findings[0].message).toContain('Guarantor Name');
  });

  it('checkConditionalRequiredWithoutMapping_returnsNoFindings_whenMappingExists', () => {
    // Arrange — conditional_required rule exists, but mapping is also present
    const conditionalRule = makeValidationRule({
      ruleType: 'conditional_required' as ValidationRuleType,
    });
    const input = makeCleanInput({
      validationRules: { 'vrule-1': conditionalRule },
      submissionMappings: [makeMapping({ fieldId: 'field-1' })],
    });

    // Act
    const findings = FormLinter.checkConditionalRequiredWithoutMapping(input);

    // Assert
    expect(findings).toHaveLength(0);
  });
});

// ─── L008 — Cross-field rule target missing (pre-wired) ───────────────────────

describe('FormLinter — L008 cross-field rule target missing (pre-wired)', () => {
  it('checkCrossFieldRuleTargets_returnsNoFindings_whenNoCrossFieldRules', () => {
    // Arrange — no cross_field rules in current model
    const input = makeCleanInput();

    // Act
    const findings = FormLinter.checkCrossFieldRuleTargets(input);

    // Assert — dormant
    expect(findings).toHaveLength(0);
  });

  it('checkCrossFieldRuleTargets_returnsError_whenTargetFieldIsMissing', () => {
    // Arrange — simulate Phase 1 extension: cross_field rule whose ruleValue is a deleted field ID
    const crossFieldRule = makeValidationRule({
      id: 'vrule-1',
      fieldId: 'field-1',
      ruleType: 'cross_field' as ValidationRuleType,
      ruleValue: 'deleted-field-id',
    });
    const input = makeCleanInput({
      fields: { 'field-1': makeField({ id: 'field-1' }) },
      validationRules: { 'vrule-1': crossFieldRule },
    });

    // Act
    const findings = FormLinter.checkCrossFieldRuleTargets(input);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].code).toBe('L008');
    expect(findings[0].nodeType).toBe('rule');
    expect(findings[0].nodeId).toBe('vrule-1');
  });

  it('checkCrossFieldRuleTargets_returnsNoFindings_whenTargetFieldExists', () => {
    // Arrange — cross_field rule whose target field still exists
    const crossFieldRule = makeValidationRule({
      ruleType: 'cross_field' as ValidationRuleType,
      ruleValue: 'field-2',
    });
    const input = makeCleanInput({
      fields: {
        'field-1': makeField({ id: 'field-1' }),
        'field-2': makeField({ id: 'field-2', code: 'end_date' }),
      },
      validationRules: { 'vrule-1': crossFieldRule },
    });

    // Act
    const findings = FormLinter.checkCrossFieldRuleTargets(input);

    // Assert
    expect(findings).toHaveLength(0);
  });
});

// ─── L009 / L010 — Field count limits ────────────────────────────────────────

describe('FormLinter — L009/L010 field count limits', () => {
  it('checkScaleLimits_returnsNoFindings_whenFieldCountIsBelowWarningThreshold', () => {
    // Arrange — 159 fields (< 160 warning threshold)
    const input = makeCleanInput({ fields: generateFields(159) });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    expect(findings.filter(f => f.code === 'L009' || f.code === 'L010')).toHaveLength(0);
  });

  it('checkScaleLimits_returnsInfo_whenFieldCountMeetsWarningThreshold', () => {
    // Arrange — exactly 160 fields
    const input = makeCleanInput({ fields: generateFields(160) });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    const l009 = findings.find(f => f.code === 'L009');
    expect(l009).toBeDefined();
    expect(l009?.severity).toBe('info');
    expect(l009?.nodeType).toBe('form');
    expect(l009?.nodeId).toBe('form');
  });

  it('checkScaleLimits_returnsError_whenFieldCountExceedsLimit', () => {
    // Arrange — 201 fields (> 200 limit)
    const input = makeCleanInput({ fields: generateFields(201) });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    const l010 = findings.find(f => f.code === 'L010');
    expect(l010).toBeDefined();
    expect(l010?.severity).toBe('error');
    expect(l010?.nodeType).toBe('form');
    expect(l010?.nodeId).toBe('form');
  });
});

// ─── L011 / L012 — Business rule count limits ─────────────────────────────────

describe('FormLinter — L011/L012 business rule count limits', () => {
  it('checkScaleLimits_returnsNoFindings_whenRuleCountIsBelowWarningThreshold', () => {
    // Arrange — 39 business rules (< 40 warning threshold)
    const validCode = 'field_a';
    const rules = generateBusinessRules(39, validCode);
    const input = makeCleanInput({
      fields: { 'f-a': makeField({ id: 'f-a', code: validCode }) },
      businessRules: rules,
    });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    expect(findings.filter(f => f.code === 'L011' || f.code === 'L012')).toHaveLength(0);
  });

  it('checkScaleLimits_returnsInfo_whenRuleCountMeetsWarningThreshold', () => {
    // Arrange — exactly 40 business rules
    const validCode = 'field_a';
    const rules = generateBusinessRules(40, validCode);
    const input = makeCleanInput({
      fields: { 'f-a': makeField({ id: 'f-a', code: validCode }) },
      businessRules: rules,
    });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    const l011 = findings.find(f => f.code === 'L011');
    expect(l011).toBeDefined();
    expect(l011?.severity).toBe('info');
  });

  it('checkScaleLimits_returnsError_whenRuleCountExceedsLimit', () => {
    // Arrange — 51 business rules (> 50 limit)
    const validCode = 'field_a';
    const rules = generateBusinessRules(51, validCode);
    const input = makeCleanInput({
      fields: { 'f-a': makeField({ id: 'f-a', code: validCode }) },
      businessRules: rules,
    });

    // Act
    const findings = FormLinter.checkScaleLimits(input);

    // Assert
    const l012 = findings.find(f => f.code === 'L012');
    expect(l012).toBeDefined();
    expect(l012?.severity).toBe('error');
  });
});

// ─── Composite — lint() runs all rules and composes findings ──────────────────

describe('FormLinter — lint() composite', () => {
  it('lint_returnsAllExpectedFindings_forFormWithMultipleViolations', () => {
    // Arrange
    // L001: two fields share code 'duplicate'
    // L002: field-required has isRequired:true and no mapping
    // L004: validation rule references non-existent field
    // L005: business rule references non-existent field code 'ghost_field'
    // L006: section-empty has no fields

    const fieldA = makeField({ id: 'field-a', code: 'duplicate', sectionId: 'section-1' });
    const fieldB = makeField({ id: 'field-b', code: 'duplicate', sectionId: 'section-1' });
    const fieldRequired = makeField({ id: 'field-req', code: 'email', isRequired: true, sectionId: 'section-1' });

    const orphanedRule = makeValidationRule({ id: 'vrule-orphan', fieldId: 'non-existent-field' });

    const bruleWithGhost = makeBusinessRule({
      id: 'brule-ghost',
      name: 'Ghost Rule',
      definition: {
        version: '1.0',
        trigger_field_code: 'ghost_field',
        trigger_event: 'on_change',
        condition_group: { logical_operator: 'AND', conditions: [] },
        actions: [],
      },
    });

    const tab = makeTab({ id: 'tab-1' });
    const sectionFull = makeSection({ id: 'section-1', tabId: 'tab-1', label: 'Full Section' });
    const sectionEmpty = makeSection({ id: 'section-empty', tabId: 'tab-1', label: 'Empty Section' });

    const input: FormLinterInput = {
      fields: {
        'field-a': fieldA,
        'field-b': fieldB,
        'field-req': fieldRequired,
      },
      tabs: { 'tab-1': tab },
      sections: { 'section-1': sectionFull, 'section-empty': sectionEmpty },
      validationRules: { 'vrule-orphan': orphanedRule },
      businessRules: { 'brule-ghost': bruleWithGhost },
      tabOrder: ['tab-1'],
      sectionOrder: { 'tab-1': ['section-1', 'section-empty'] },
      fieldOrder: {
        'section-1': ['field-a', 'field-b', 'field-req'],
        'section-empty': [],
      },
      submissionMappings: [],
      crmAttributeCache: undefined,
    };

    // Act
    const findings = FormLinter.lint(input);

    // Assert — verify each expected rule fired
    const codes = findings.map(f => f.code);

    // L001: both duplicate fields flagged
    expect(codes.filter(c => c === 'L001')).toHaveLength(2);

    // L002: required field-req has no mapping
    const l002 = findings.filter(f => f.code === 'L002');
    expect(l002).toHaveLength(1);
    expect(l002[0].nodeId).toBe('field-req');

    // L004: orphaned validation rule
    const l004 = findings.filter(f => f.code === 'L004');
    expect(l004).toHaveLength(1);
    expect(l004[0].nodeId).toBe('vrule-orphan');

    // L005: business rule references ghost_field
    const l005 = findings.filter(f => f.code === 'L005');
    expect(l005.length).toBeGreaterThanOrEqual(1);
    expect(l005.every(f => f.nodeId === 'brule-ghost')).toBe(true);

    // L006: empty section
    const l006 = findings.filter(f => f.code === 'L006');
    expect(l006).toHaveLength(1);
    expect(l006[0].nodeId).toBe('section-empty');
    expect(l006[0].nodeType).toBe('section');

    // No spurious findings for codes that should not fire
    expect(findings.filter(f => f.code === 'L003')).toHaveLength(0); // no cache
    expect(findings.filter(f => f.code === 'L007')).toHaveLength(0); // no conditional_required rules
    expect(findings.filter(f => f.code === 'L008')).toHaveLength(0); // no cross_field rules
    expect(findings.filter(f => f.code === 'L009' || f.code === 'L010')).toHaveLength(0); // only 3 fields
    expect(findings.filter(f => f.code === 'L011' || f.code === 'L012')).toHaveLength(0); // only 1 rule
    expect(findings.filter(f => f.code === 'L013')).toHaveLength(0); // dormant
  });

  it('lint_returnsEmptyArray_forCleanMinimalForm', () => {
    // Arrange — perfectly clean form with no violations
    const input = makeCleanInput();

    // Act
    const findings = FormLinter.lint(input);

    // Assert
    expect(findings).toHaveLength(0);
  });
});

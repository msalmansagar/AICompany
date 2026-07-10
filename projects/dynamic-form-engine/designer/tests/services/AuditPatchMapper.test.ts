import { describe, it, expect } from 'vitest';
import { mapPatches } from '@/services/AuditPatchMapper';
import type { ImmerPatch, AuditMetadata } from '@/services/AuditPatchMapper';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_METADATA: AuditMetadata = {
  formId: 'form-001',
  formVersionId: 'version-002',
  changedBy: 'user-abc',
  changedOn: '2026-07-11T08:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAddPatch(path: Array<string | number>, value: unknown): ImmerPatch {
  return { op: 'add', path, value };
}

function buildReplacePatch(path: Array<string | number>, newValue: unknown): ImmerPatch {
  return { op: 'replace', path, value: newValue };
}

function buildRemovePatch(path: Array<string | number>): ImmerPatch {
  return { op: 'remove', path };
}

function buildInverseForAdd(path: Array<string | number>): ImmerPatch {
  // immer inverse of 'add' is 'remove' (no value)
  return { op: 'remove', path };
}

function buildInverseForReplace(path: Array<string | number>, priorValue: unknown): ImmerPatch {
  // immer inverse of 'replace' is 'replace' with the prior value
  return { op: 'replace', path, value: priorValue };
}

function buildInverseForRemove(path: Array<string | number>, priorValue: unknown): ImmerPatch {
  // immer inverse of 'remove' is 'add' with the removed value
  return { op: 'add', path, value: priorValue };
}

// ---------------------------------------------------------------------------
// Tests: ADD patch (action = create)
// ---------------------------------------------------------------------------

describe('mapPatches — add patch (field create)', () => {
  it('mapPatches_addFieldPatch_returnsCreateAction', () => {
    const patches: ImmerPatch[] = [
      buildAddPatch(['fields', 'loan_amount'], { label: 'Loan Amount', fieldType: 'number' }),
    ];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'loan_amount'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create');
  });

  it('mapPatches_addFieldPatch_extractsFieldSchemaName', () => {
    const patches: ImmerPatch[] = [
      buildAddPatch(['fields', 'guarantor_name'], { label: 'Guarantor Name' }),
    ];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'guarantor_name'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].fieldSchemaName).toBe('guarantor_name');
  });

  it('mapPatches_addFieldPatch_setsBeforeToNull', () => {
    const patches: ImmerPatch[] = [
      buildAddPatch(['fields', 'new_field'], { label: 'New' }),
    ];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'new_field'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].before).toBeNull();
  });

  it('mapPatches_addFieldPatch_serialisesAfterValueAsJson', () => {
    const fieldValue = { label: 'Loan Amount', fieldType: 'number', isRequired: true };
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'loan_amount'], fieldValue)];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'loan_amount'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].after).toBe(JSON.stringify(fieldValue));
  });

  it('mapPatches_addFieldPatch_buildsCorrectJsonPointer', () => {
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'email_address'], {})];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'email_address'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].changePath).toBe('/fields/email_address');
  });

  it('mapPatches_addFieldPatch_classifiesEventTypeAsFieldChange', () => {
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'new_field'], {})];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'new_field'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('FieldChange');
  });

  it('mapPatches_addFieldPatch_propagatesMetadata', () => {
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'x'], {})];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'x'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].formId).toBe(BASE_METADATA.formId);
    expect(result[0].formVersionId).toBe(BASE_METADATA.formVersionId);
    expect(result[0].changedBy).toBe(BASE_METADATA.changedBy);
    expect(result[0].changedOn).toBe(BASE_METADATA.changedOn);
  });
});

// ---------------------------------------------------------------------------
// Tests: REPLACE patch (action = update)
// ---------------------------------------------------------------------------

describe('mapPatches — replace patch (field update)', () => {
  it('mapPatches_replaceFieldPropertyPatch_returnsUpdateAction', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['fields', 'loan_amount', 'isRequired'], true),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['fields', 'loan_amount', 'isRequired'], false),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].action).toBe('update');
  });

  it('mapPatches_replaceFieldPropertyPatch_serialisesBeforeAndAfterValues', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['fields', 'loan_amount', 'label'], 'Loan Total'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['fields', 'loan_amount', 'label'], 'Loan Amount'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].before).toBe(JSON.stringify('Loan Amount'));
    expect(result[0].after).toBe(JSON.stringify('Loan Total'));
  });

  it('mapPatches_replaceFieldPropertyPatch_buildsDeepJsonPointer', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['fields', 'loan_amount', 'validationRules', 0, 'isRequired'], true),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['fields', 'loan_amount', 'validationRules', 0, 'isRequired'], false),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].changePath).toBe('/fields/loan_amount/validationRules/0/isRequired');
  });

  it('mapPatches_replaceValidationRulePatch_classifiesEventTypeAsRuleChange', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['validationRules', 0, 'errorMessage'], 'Required'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['validationRules', 0, 'errorMessage'], 'This field is required'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('RuleChange');
    expect(result[0].fieldSchemaName).toBe('');
  });

  it('mapPatches_replaceBusinessRulePatch_classifiesEventTypeAsRuleChange', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['businessRules', 0, 'conditionJson'], '{"op":"eq"}'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['businessRules', 0, 'conditionJson'], '{}'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('RuleChange');
  });

  it('mapPatches_replaceSubmissionMappingPatch_classifiesEventTypeAsMappingChange', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['submissionMappings', 'loan_amount', 'targetAttribute'], 'qdb_loanvalue'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['submissionMappings', 'loan_amount', 'targetAttribute'], 'qdb_loanamount'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('MappingChange');
  });

  it('mapPatches_replaceTranslationPatch_classifiesEventTypeAsTranslationChange', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['translations', 'ar', 'loan_amount', 'label'], 'مبلغ القرض'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['translations', 'ar', 'loan_amount', 'label'], ''),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('TranslationChange');
  });

  it('mapPatches_replaceFormRootPropertyPatch_classifiesEventTypeAsFormChange', () => {
    const patches: ImmerPatch[] = [
      buildReplacePatch(['name'], 'Updated Form Name'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['name'], 'Original Form Name'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].eventType).toBe('FormChange');
    expect(result[0].fieldSchemaName).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests: REMOVE patch (action = delete)
// ---------------------------------------------------------------------------

describe('mapPatches — remove patch (field delete)', () => {
  it('mapPatches_removeFieldPatch_returnsDeleteAction', () => {
    const removedField = { label: 'Old Field', fieldType: 'text' };
    const patches: ImmerPatch[] = [buildRemovePatch(['fields', 'old_field'])];
    const inversePatches: ImmerPatch[] = [
      buildInverseForRemove(['fields', 'old_field'], removedField),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].action).toBe('delete');
  });

  it('mapPatches_removeFieldPatch_setsAfterToNull', () => {
    const patches: ImmerPatch[] = [buildRemovePatch(['fields', 'old_field'])];
    const inversePatches: ImmerPatch[] = [
      buildInverseForRemove(['fields', 'old_field'], { label: 'Old' }),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].after).toBeNull();
  });

  it('mapPatches_removeFieldPatch_serialisesBeforeValueFromInversePatch', () => {
    const removedValue = { label: 'Old Field', isRequired: false };
    const patches: ImmerPatch[] = [buildRemovePatch(['fields', 'old_field'])];
    const inversePatches: ImmerPatch[] = [
      buildInverseForRemove(['fields', 'old_field'], removedValue),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].before).toBe(JSON.stringify(removedValue));
  });

  it('mapPatches_removeFieldPatch_extractsFieldSchemaName', () => {
    const patches: ImmerPatch[] = [buildRemovePatch(['fields', 'guarantor_name'])];
    const inversePatches: ImmerPatch[] = [
      buildInverseForRemove(['fields', 'guarantor_name'], {}),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].fieldSchemaName).toBe('guarantor_name');
  });
});

// ---------------------------------------------------------------------------
// Tests: Multiple patches
// ---------------------------------------------------------------------------

describe('mapPatches — multiple patches', () => {
  it('mapPatches_multiplePatchesInOneBatch_returnsOneEntryPerPatch', () => {
    const patches: ImmerPatch[] = [
      buildAddPatch(['fields', 'field_a'], { label: 'A' }),
      buildReplacePatch(['fields', 'field_b', 'label'], 'B Updated'),
      buildRemovePatch(['fields', 'field_c']),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForAdd(['fields', 'field_a']),
      buildInverseForReplace(['fields', 'field_b', 'label'], 'B'),
      buildInverseForRemove(['fields', 'field_c'], { label: 'C' }),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result).toHaveLength(3);
    expect(result[0].action).toBe('create');
    expect(result[1].action).toBe('update');
    expect(result[2].action).toBe('delete');
  });

  it('mapPatches_multiplePatchesInOneBatch_allEntriesCarrySharedMetadata', () => {
    const patches: ImmerPatch[] = [
      buildAddPatch(['fields', 'x'], {}),
      buildAddPatch(['fields', 'y'], {}),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForAdd(['fields', 'x']),
      buildInverseForAdd(['fields', 'y']),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    for (const entry of result) {
      expect(entry.formId).toBe(BASE_METADATA.formId);
      expect(entry.changedBy).toBe(BASE_METADATA.changedBy);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

describe('mapPatches — edge cases', () => {
  it('mapPatches_emptyPatchArray_returnsEmptyArray', () => {
    const result = mapPatches([], [], BASE_METADATA);

    expect(result).toHaveLength(0);
  });

  it('mapPatches_nullFormVersionId_propagatesNullToEntries', () => {
    const metadataWithoutVersion: AuditMetadata = { ...BASE_METADATA, formVersionId: null };
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'x'], {})];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'x'])];

    const result = mapPatches(patches, inversePatches, metadataWithoutVersion);

    expect(result[0].formVersionId).toBeNull();
  });

  it('mapPatches_mismatchedArrayLengths_throwsDescriptiveError', () => {
    const patches: ImmerPatch[] = [buildAddPatch(['fields', 'x'], {})];
    const inversePatches: ImmerPatch[] = [];

    expect(() => mapPatches(patches, inversePatches, BASE_METADATA)).toThrow(
      /patches length \(1\) does not match inversePatches length \(0\)/,
    );
  });

  it('mapPatches_pathWithSpecialCharacters_escapesJsonPointerSegments', () => {
    // JSON Pointer spec: ~ -> ~0, / -> ~1
    const patches: ImmerPatch[] = [
      buildReplacePatch(['fields', 'field/with~slashes', 'label'], 'New Label'),
    ];
    const inversePatches: ImmerPatch[] = [
      buildInverseForReplace(['fields', 'field/with~slashes', 'label'], 'Old Label'),
    ];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].changePath).toBe('/fields/field~1with~0slashes/label');
  });

  it('mapPatches_emptyPathArray_returnsRootPointer', () => {
    const patches: ImmerPatch[] = [buildReplacePatch([], { form: 'root replaced' })];
    const inversePatches: ImmerPatch[] = [buildInverseForReplace([], { form: 'original' })];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].changePath).toBe('/');
  });

  it('mapPatches_addPatchWithNullValue_serialisesNullAsAfterValue', () => {
    // immer can emit an add with value undefined in some edge cases
    const patches: ImmerPatch[] = [{ op: 'add', path: ['fields', 'x'], value: null }];
    const inversePatches: ImmerPatch[] = [buildInverseForAdd(['fields', 'x'])];

    const result = mapPatches(patches, inversePatches, BASE_METADATA);

    expect(result[0].after).toBe('null');
  });
});

// Design-time config linter — pure static analysis of an in-memory form snapshot.
// Invoked live in the designer (debounced 500 ms) and at the pre-publish gate.
//
// ADR-005: BUILD decision — no library covers DFE-domain cross-reference rules
// (field code vs rule field_code; mapping target vs CRM attribute schema).
//
// Architectural note: "schemaName" in the Phase 3 architecture document maps to
// DesignerFieldModel.code in the actual model. All field references in business-rule
// conditions and actions use field.code, while validation rules reference fields by
// record GUID (fieldId). Both are reflected in the lint rules below.

import type {
  DesignerFieldModel,
  DesignerTabModel,
  DesignerSectionModel,
} from '@/state/models/DesignerFormModel';
import type {
  DesignerValidationRule,
  DesignerBusinessRule,
} from '@/state/models/DesignerRuleModel';
import type { BusinessRuleDefinition } from '@/types/businessRule';
import type { SubmissionMapping } from '@/services/SubmissionMappingService';

// ─── Public result contract ───────────────────────────────────────────────────

export type LintSeverity = 'error' | 'warning' | 'info';
export type LintNodeType = 'form' | 'tab' | 'section' | 'field' | 'mapping' | 'rule';

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  message: string;
  nodeType: LintNodeType;
  /** Dataverse record ID of the affected node, or 'form' for form-level findings. */
  nodeId: string;
}

// ─── CRM metadata cache ───────────────────────────────────────────────────────

/** Attribute list fetched once per designer session via EntityDefinitions Web API call. */
export interface CrmAttributeCache {
  entityName: string;
  /** Logical names of all attributes on the CRM entity. */
  attributes: string[];
  fetchedAt: Date;
}

// ─── Linter input ─────────────────────────────────────────────────────────────

/**
 * Plain snapshot of all data the linter needs.
 * Intentionally does NOT depend on Zustand — the caller projects the store slice
 * and passes submission mappings (which live outside the store) separately.
 */
export interface FormLinterInput {
  fields: Record<string, DesignerFieldModel>;
  tabs: Record<string, DesignerTabModel>;
  sections: Record<string, DesignerSectionModel>;
  validationRules: Record<string, DesignerValidationRule>;
  businessRules: Record<string, DesignerBusinessRule>;
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;
  fieldOrder: Record<string, string[]>;
  /** Fetched separately from the store via SubmissionMappingService.listMappingsForForm(). */
  submissionMappings: SubmissionMapping[];
  /** Optional: required for L003. Pass undefined when the cache is not yet populated. */
  crmAttributeCache?: CrmAttributeCache;
}

// ─── Scale limits (ENT-010) ───────────────────────────────────────────────────

const FIELD_COUNT_LIMIT = 200;
const FIELD_COUNT_WARNING_THRESHOLD = 160;
const BUSINESS_RULE_COUNT_LIMIT = 50;
const BUSINESS_RULE_COUNT_WARNING_THRESHOLD = 40;

// ─── FormLinter ───────────────────────────────────────────────────────────────

/**
 * Stateless, side-effect-free form config linter.
 * All methods are pure: they read the input and return findings without mutating state.
 */
export class FormLinter {
  /**
   * Run all active lint rules and return a flat finding list.
   * Performance contract (FR-003): completes in < 2 s for 100 fields + 50 rules.
   * All rules are O(N) graph walks with no I/O — observed runtime is < 10 ms.
   */
  static lint(input: FormLinterInput): LintFinding[] {
    return [
      ...FormLinter.checkDuplicateFieldCodes(input),
      ...FormLinter.checkRequiredFieldsWithoutMapping(input),
      ...FormLinter.checkOrphanedSubmissionMappings(input),
      ...FormLinter.checkOrphanedValidationRuleReferences(input),
      ...FormLinter.checkOrphanedBusinessRuleReferences(input),
      ...FormLinter.checkEmptyContainers(input),
      ...FormLinter.checkConditionalRequiredWithoutMapping(input),
      ...FormLinter.checkCrossFieldRuleTargets(input),
      ...FormLinter.checkScaleLimits(input),
      ...FormLinter.checkPiiSensitivityMismatch(input),
    ];
  }

  /**
   * L001 — error
   * Two or more fields share the same code value across all tabs and sections.
   * Every duplicate occurrence is flagged so the author can navigate to any of them.
   */
  static checkDuplicateFieldCodes(input: FormLinterInput): LintFinding[] {
    const codeToFieldIds = groupFieldIdsByCode(input.fields);
    const findings: LintFinding[] = [];

    for (const [code, ids] of codeToFieldIds) {
      if (ids.length <= 1) continue;
      for (const id of ids) {
        findings.push({
          severity: 'error',
          code: 'L001',
          message: `Field code "${code}" is used by ${ids.length} fields — codes must be unique within the form`,
          nodeType: 'field',
          nodeId: id,
        });
      }
    }

    return findings;
  }

  /**
   * L002 — warning
   * A field with isRequired: true has no entry in submissionMappings.
   * Fields with a conditional_required validation rule are exempt (covered by L007).
   */
  static checkRequiredFieldsWithoutMapping(input: FormLinterInput): LintFinding[] {
    const mappedFieldIds = buildMappedFieldIdSet(input.submissionMappings);
    const conditionalRequiredFieldIds = buildConditionalRequiredFieldIdSet(input.validationRules);
    const findings: LintFinding[] = [];

    for (const field of Object.values(input.fields)) {
      if (!field.isRequired) continue;
      if (mappedFieldIds.has(field.id)) continue;
      if (conditionalRequiredFieldIds.has(field.id)) continue;

      findings.push({
        severity: 'warning',
        code: 'L002',
        message: `Required field "${field.label || field.code}" has no submission mapping`,
        nodeType: 'field',
        nodeId: field.id,
      });
    }

    return findings;
  }

  /**
   * L003 — warning
   * A submission mapping's targetAttribute is not present in the CRM attribute cache.
   * Skipped silently when crmAttributeCache is absent (cache not yet populated).
   */
  static checkOrphanedSubmissionMappings(input: FormLinterInput): LintFinding[] {
    if (!input.crmAttributeCache) return [];

    const knownAttributes = new Set(input.crmAttributeCache.attributes);
    const entityName = input.crmAttributeCache.entityName;
    const findings: LintFinding[] = [];

    for (const mapping of input.submissionMappings) {
      if (knownAttributes.has(mapping.targetAttribute)) continue;
      findings.push({
        severity: 'warning',
        code: 'L003',
        message: `Submission mapping targets "${mapping.targetAttribute}" which does not exist on entity "${entityName}"`,
        nodeType: 'mapping',
        nodeId: mapping.id,
      });
    }

    return findings;
  }

  /**
   * L004 — error
   * A validation rule's fieldId (Dataverse record GUID) does not match any field
   * in the current form. This occurs when a field is deleted but its rules are not.
   */
  static checkOrphanedValidationRuleReferences(input: FormLinterInput): LintFinding[] {
    const fieldIds = new Set(Object.keys(input.fields));
    const findings: LintFinding[] = [];

    for (const rule of Object.values(input.validationRules)) {
      if (fieldIds.has(rule.fieldId)) continue;
      findings.push({
        severity: 'error',
        code: 'L004',
        message: `Validation rule "${rule.ruleType}" references a deleted field (id: ${rule.fieldId})`,
        nodeType: 'rule',
        nodeId: rule.id,
      });
    }

    return findings;
  }

  /**
   * L005 — error
   * A business rule condition or action references a field code that does not exist.
   * Checks trigger_field_code, condition field_codes, and action target_field_codes.
   * One finding per orphaned code to allow independent resolution.
   */
  static checkOrphanedBusinessRuleReferences(input: FormLinterInput): LintFinding[] {
    const validFieldCodes = buildFieldCodeSet(input.fields);
    const findings: LintFinding[] = [];

    for (const rule of Object.values(input.businessRules)) {
      const orphanedCodes = collectOrphanedBusinessRuleCodes(rule.definition, validFieldCodes);
      for (const orphanedCode of orphanedCodes) {
        findings.push({
          severity: 'error',
          code: 'L005',
          message: `Business rule "${rule.name}" references field code "${orphanedCode}" which does not exist in this form`,
          nodeType: 'rule',
          nodeId: rule.id,
        });
      }
    }

    return findings;
  }

  /**
   * L006 — info
   * A tab contains no sections, or a section contains no fields.
   * Uses tabOrder and fieldOrder to respect the authored structure.
   */
  static checkEmptyContainers(input: FormLinterInput): LintFinding[] {
    const findings: LintFinding[] = [];

    for (const tabId of input.tabOrder) {
      const sectionIds = input.sectionOrder[tabId] ?? [];

      if (sectionIds.length === 0) {
        const tabLabel = input.tabs[tabId]?.label ?? tabId;
        findings.push({
          severity: 'info',
          code: 'L006',
          message: `Tab "${tabLabel}" has no sections`,
          nodeType: 'tab',
          nodeId: tabId,
        });
        continue;
      }

      for (const sectionId of sectionIds) {
        if ((input.fieldOrder[sectionId] ?? []).length > 0) continue;
        const sectionLabel = input.sections[sectionId]?.label ?? sectionId;
        findings.push({
          severity: 'info',
          code: 'L006',
          message: `Section "${sectionLabel}" has no fields`,
          nodeType: 'section',
          nodeId: sectionId,
        });
      }
    }

    return findings;
  }

  /**
   * L007 — warning
   * A field has a conditional_required validation rule but no submission mapping.
   * Pre-wired: 'conditional_required' is not yet in ValidationRuleType (Phase 1 extension).
   * Activates automatically when the rule type is added to DesignerRuleModel.
   */
  static checkConditionalRequiredWithoutMapping(input: FormLinterInput): LintFinding[] {
    const mappedFieldIds = buildMappedFieldIdSet(input.submissionMappings);
    const findings: LintFinding[] = [];

    for (const rule of Object.values(input.validationRules)) {
      // Cast to string: 'conditional_required' is a future extension not yet in the type union.
      if ((rule.ruleType as string) !== 'conditional_required') continue;
      if (mappedFieldIds.has(rule.fieldId)) continue;

      const field = input.fields[rule.fieldId];
      findings.push({
        severity: 'warning',
        code: 'L007',
        message: `Field "${field?.label ?? rule.fieldId}" has a conditional-required rule but no submission mapping`,
        nodeType: 'field',
        nodeId: rule.fieldId,
      });
    }

    return findings;
  }

  /**
   * L008 — error
   * A cross_field validation rule's target field reference (stored in ruleValue) does not
   * match any field in the current form.
   * Pre-wired: 'cross_field' is not yet in ValidationRuleType (Phase 1 extension).
   * Activates automatically when the rule type and ruleValue convention are in place.
   */
  static checkCrossFieldRuleTargets(input: FormLinterInput): LintFinding[] {
    const fieldIds = new Set(Object.keys(input.fields));
    const findings: LintFinding[] = [];

    for (const rule of Object.values(input.validationRules)) {
      // Cast to string: 'cross_field' is a future extension not yet in the type union.
      if ((rule.ruleType as string) !== 'cross_field') continue;
      if (rule.ruleValue === null || fieldIds.has(rule.ruleValue)) continue;

      findings.push({
        severity: 'error',
        code: 'L008',
        message: `Cross-field rule references target field "${rule.ruleValue}" which does not exist in this form`,
        nodeType: 'rule',
        nodeId: rule.id,
      });
    }

    return findings;
  }

  /**
   * L009 / L010 — info / error: approaching or exceeding the field count limit.
   * L011 / L012 — info / error: approaching or exceeding the business rule count limit.
   */
  static checkScaleLimits(input: FormLinterInput): LintFinding[] {
    const totalFields = Object.keys(input.fields).length;
    const totalBusinessRules = Object.keys(input.businessRules).length;
    const findings: LintFinding[] = [];

    if (totalFields > FIELD_COUNT_LIMIT) {
      findings.push({
        severity: 'error',
        code: 'L010',
        message: `Form has ${totalFields} fields; the maximum is ${FIELD_COUNT_LIMIT}`,
        nodeType: 'form',
        nodeId: 'form',
      });
    } else if (totalFields >= FIELD_COUNT_WARNING_THRESHOLD) {
      findings.push({
        severity: 'info',
        code: 'L009',
        message: `Form is approaching the field limit (${totalFields} / ${FIELD_COUNT_LIMIT} fields used)`,
        nodeType: 'form',
        nodeId: 'form',
      });
    }

    if (totalBusinessRules > BUSINESS_RULE_COUNT_LIMIT) {
      findings.push({
        severity: 'error',
        code: 'L012',
        message: `Form has ${totalBusinessRules} business rules; the maximum is ${BUSINESS_RULE_COUNT_LIMIT}`,
        nodeType: 'form',
        nodeId: 'form',
      });
    } else if (totalBusinessRules >= BUSINESS_RULE_COUNT_WARNING_THRESHOLD) {
      findings.push({
        severity: 'info',
        code: 'L011',
        message: `Form is approaching the business rule limit (${totalBusinessRules} / ${BUSINESS_RULE_COUNT_LIMIT} rules used)`,
        nodeType: 'form',
        nodeId: 'form',
      });
    }

    return findings;
  }

  /**
   * L013 — warning (DORMANT — Phase 2)
   * A field has a PII category but its sensitivity level is Public.
   * Pre-wired: piiCategory and sensitivityLevel do not yet exist on DesignerFieldModel.
   * Activates when Phase 2 adds ENT-003 PII metadata fields to the field model.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static checkPiiSensitivityMismatch(_input: FormLinterInput): LintFinding[] {
    // Dormant until Phase 2 adds piiCategory and sensitivityLevel to DesignerFieldModel.
    return [];
  }
}

// ─── Private helper functions ─────────────────────────────────────────────────

/** Groups all field IDs by their code value. Used by L001. */
function groupFieldIdsByCode(fields: Record<string, DesignerFieldModel>): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const field of Object.values(fields)) {
    const code = field.code.trim();
    if (!code) continue;
    const existing = result.get(code) ?? [];
    existing.push(field.id);
    result.set(code, existing);
  }

  return result;
}

/** Builds a Set of field IDs that have at least one active submission mapping. */
function buildMappedFieldIdSet(mappings: SubmissionMapping[]): Set<string> {
  return new Set(mappings.map(m => m.fieldId));
}

/**
 * Builds the Set of field codes from all fields in the form.
 * Empty codes are excluded — they are caught by the publish validation (PV-007).
 */
function buildFieldCodeSet(fields: Record<string, DesignerFieldModel>): Set<string> {
  const codes = new Set<string>();
  for (const field of Object.values(fields)) {
    const code = field.code.trim();
    if (code) codes.add(code);
  }
  return codes;
}

/**
 * Returns the set of field IDs that have any conditional_required validation rule.
 * Used to exclude those fields from L002 (they are handled by L007 instead).
 */
function buildConditionalRequiredFieldIdSet(
  rules: Record<string, DesignerValidationRule>
): Set<string> {
  const ids = new Set<string>();
  for (const rule of Object.values(rules)) {
    // Cast to string: 'conditional_required' is not yet in the ValidationRuleType union.
    if ((rule.ruleType as string) === 'conditional_required') {
      ids.add(rule.fieldId);
    }
  }
  return ids;
}

/**
 * Collects all field codes referenced by a business rule definition that are NOT
 * present in the validCodes set. Deduplicates: one orphaned code returned at most once.
 */
function collectOrphanedBusinessRuleCodes(
  definition: BusinessRuleDefinition,
  validCodes: Set<string>
): string[] {
  const referenced = new Set<string>();
  referenced.add(definition.trigger_field_code);

  for (const condition of definition.condition_group.conditions) {
    referenced.add(condition.field_code);
  }

  for (const action of definition.actions) {
    referenced.add(action.target_field_code);
  }

  return [...referenced].filter(code => !validCodes.has(code));
}

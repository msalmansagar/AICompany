// Publish validation — gates form publication behind a full checklist.
// All checks must pass before a form can be published.
// Uses Zod for type-safe validation schemas at the boundary.

import { z } from 'zod';
import type { DesignerState } from '@/state/designerStore';
import { FIELD_TYPE } from '@/constants/fieldTypes';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PublishValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

const formNameSchema = z.string().min(1, 'Form name is required').max(200);
const formCodeSchema = z
  .string()
  .min(1, 'Form code is required')
  .max(100)
  .regex(/^[a-z0-9_]+$/, 'Form code must contain only lowercase letters, numbers, and underscores');

function validateFormBasics(state: DesignerState, issues: ValidationIssue[]): void {
  const nameResult = formNameSchema.safeParse(state.form?.name ?? '');
  if (!nameResult.success) {
    issues.push({ code: 'PV-001', message: nameResult.error.errors[0]?.message ?? 'Invalid form name', severity: 'error' });
  }

  const codeResult = formCodeSchema.safeParse(state.form?.code ?? '');
  if (!codeResult.success) {
    issues.push({ code: 'PV-002', message: codeResult.error.errors[0]?.message ?? 'Invalid form code', severity: 'error' });
  }
}

function validateTabStructure(state: DesignerState, issues: ValidationIssue[]): void {
  if (state.tabOrder.length === 0) {
    issues.push({ code: 'PV-003', message: 'Form must have at least one tab', severity: 'error' });
    return;
  }

  for (const tabId of state.tabOrder) {
    const tab = state.tabs[tabId];
    if (!tab) continue;

    if (!tab.label || tab.label.trim() === '') {
      issues.push({ code: 'PV-004', message: `Tab is missing a label`, severity: 'error' });
    }

    const sectionIds = state.sectionOrder[tabId] ?? [];
    if (sectionIds.length === 0) {
      issues.push({
        code: 'PV-005',
        message: `Tab "${tab.label || 'Unnamed'}" must have at least one section`,
        severity: 'error',
      });
    }
  }
}

function validateFields(state: DesignerState, issues: ValidationIssue[]): void {
  const fieldCodes = new Set<string>();

  for (const field of Object.values(state.fields)) {
    if (!field.label || field.label.trim() === '') {
      issues.push({ code: 'PV-006', message: `A field is missing a label`, severity: 'error' });
    }

    if (!field.code || field.code.trim() === '') {
      issues.push({
        code: 'PV-007',
        message: `Field "${field.label || 'Unnamed'}" is missing a code`,
        severity: 'error',
      });
    } else if (fieldCodes.has(field.code)) {
      issues.push({
        code: 'PV-008',
        message: `Duplicate field code "${field.code}" — all field codes must be unique within the form`,
        severity: 'error',
      });
    } else {
      fieldCodes.add(field.code);
    }

    // Validate options for fields that require them
    const requiresOptions = [FIELD_TYPE.DROPDOWN, FIELD_TYPE.MULTI_SELECT, FIELD_TYPE.RADIO];
    if (requiresOptions.includes(field.fieldType as typeof requiresOptions[number])) {
      if (!field.options || field.options.length === 0) {
        issues.push({
          code: 'PV-009',
          message: `Field "${field.label || field.code}" requires at least one option`,
          severity: 'error',
        });
      }
    }

    // Validate lookup configuration
    const requiresLookup = [FIELD_TYPE.LOOKUP, FIELD_TYPE.CHILD_ENTITY_GRID];
    if (requiresLookup.includes(field.fieldType as typeof requiresLookup[number])) {
      if (!field.lookupConfig || !field.lookupConfig.targetEntity) {
        issues.push({
          code: 'PV-010',
          message: `Lookup field "${field.label || field.code}" must have a target entity configured`,
          severity: 'error',
        });
      }
    }
  }
}

function validateSubmissionMapping(state: DesignerState, issues: ValidationIssue[]): void {
  // Warn if no entity is configured — submission mapping requires it
  if (!state.form?.entityLogicalName) {
    issues.push({
      code: 'PV-011',
      message: 'Form must have a target CRM entity configured for submission mapping',
      severity: 'error',
    });
  }

  // Count required fields to ensure at least one submission mapping exists
  const requiredFields = Object.values(state.fields).filter(f => f.isRequired);
  if (requiredFields.length === 0) {
    issues.push({
      code: 'PV-012',
      message: 'Form has no required fields — consider marking key fields as required',
      severity: 'warning',
    });
  }
}

/**
 * Runs all publish validation checks against the current designer state.
 * Returns a result containing all issues found.
 * isValid is true only when there are zero error-severity issues.
 */
export function validateForPublish(state: DesignerState): PublishValidationResult {
  const issues: ValidationIssue[] = [];

  validateFormBasics(state, issues);
  validateTabStructure(state, issues);
  validateFields(state, issues);
  validateSubmissionMapping(state, issues);

  const isValid = issues.every(issue => issue.severity !== 'error');
  return { isValid, issues };
}

// Publish validation — gates form publication behind a full checklist.
// All checks must pass before a form can be published.
// Uses Zod for type-safe validation schemas at the boundary.

import { z } from 'zod';
import type { DesignerState } from '@/state/designerStore';
import { FIELD_TYPE } from '@/constants/fieldTypes';
import type { ScopedButtonRecord } from '@/services/ScopedButtonDesignService';
import { findSurveyCodeError } from './surveyFormCode';

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
  // Hyphens are the established convention for form codes — every form in the org uses one,
  // and the plugin, the runtime and the publish API have always accepted them. Excluding the
  // hyphen here disabled Confirm Publish for every existing form.
  .regex(
    /^[a-z0-9_-]+$/,
    'Form code must contain only lowercase letters, numbers, hyphens, and underscores',
  );

function validateFormBasics(state: DesignerState, issues: ValidationIssue[]): void {
  const nameResult = formNameSchema.safeParse(state.form?.name ?? '');
  if (!nameResult.success) {
    issues.push({ code: 'PV-001', message: nameResult.error.errors[0]?.message ?? 'Invalid form name', severity: 'error' });
  }

  const codeResult = formCodeSchema.safeParse(state.form?.code ?? '');
  if (!codeResult.success) {
    issues.push({ code: 'PV-002', message: codeResult.error.errors[0]?.message ?? 'Invalid form code', severity: 'error' });
  }

  const surveyCodeError = state.form ? findSurveyCodeError(state.form) : null;
  if (surveyCodeError) {
    issues.push({ code: 'PV-014', message: surveyCodeError, severity: 'error' });
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
export function validateForPublish(
  state: DesignerState,
  sectionButtons?: Record<string, ScopedButtonRecord[]>,
): PublishValidationResult {
  const issues: ValidationIssue[] = [];

  validateFormBasics(state, issues);
  validateTabStructure(state, issues);
  validateFields(state, issues);
  validateSubmissionMapping(state, issues);
  validateSectionReveal(state, sectionButtons, issues);
  validateWeightedScoring(state, issues);

  const isValid = issues.every(issue => issue.severity !== 'error');
  return { isValid, issues };
}

/**
 * PV-013 — a tab revealing its sections one at a time shows the user only the section in front
 * of them, so a section with no button that advances is a dead end: they can neither continue
 * nor submit. The last section is exempt, being expected to carry a submit or next-tab button.
 *
 * Skipped when sectionButtons was not supplied, so a caller that could not load them does not
 * block publishing on a check it was unable to make.
 */
function validateSectionReveal(
  state: DesignerState,
  sectionButtons: Record<string, ScopedButtonRecord[]> | undefined,
  issues: ValidationIssue[],
): void {
  if (!sectionButtons) return;

  for (const tabId of state.tabOrder) {
    const tab = state.tabs[tabId];
    if (!tab?.revealsSectionsOneAtATime) continue;

    const sectionIds = (state.sectionOrder[tabId] ?? []).filter((id) => state.sections[id]);
    for (const sectionId of sectionIds.slice(0, -1)) {
      if (hasAdvanceButton(sectionButtons[sectionId.toLowerCase()] ?? sectionButtons[sectionId] ?? [])) continue;
      issues.push({
        code: 'PV-013',
        message:
          `Section "${state.sections[sectionId].label}" on tab "${tab.label}" has no button that `
          + 'advances to the next section, so the user cannot get past it. Add a button with '
          + 'action "Navigate: Next section".',
        severity: 'error',
      });
    }
  }
}

/**
 * An invisible button does not count — it cannot be pressed, so it does not rescue the user.
 * A conditionally-visible one does: whether its condition holds is a runtime question, and
 * blocking publish over it would be a false alarm the author cannot silence.
 */
function hasAdvanceButton(buttons: readonly ScopedButtonRecord[]): boolean {
  return buttons.some((button) => {
    if (!button.isVisible || button.actionType !== 'navigate') return false;
    try {
      return (JSON.parse(button.actionConfigJson) as { target?: string }).target === 'nextSection';
    } catch {
      return false;
    }
  });
}

// Field types that can carry a Weight in a weighted survey (FR-CSE-063).
const SCORABLE_OPTION_FIELD_TYPES = new Set([
  FIELD_TYPE.DROPDOWN, FIELD_TYPE.RADIO, FIELD_TYPE.MULTI_SELECT,
  FIELD_TYPE.CHECKBOX, FIELD_TYPE.BOOLEAN,
]);
const SCORABLE_NUMBER_FIELD_TYPES = new Set(['number', 'decimal', 'currency']);

/**
 * Effective weight for a field: null/undefined/empty → 1 (default). Explicit 0 → excluded.
 */
function effectiveWeight(weight: number | null | undefined): number {
  return weight != null ? weight : 1;
}

/**
 * FR-CSE-070 — refuse to publish a Weighted survey unless:
 *   PV-015: at least one scorable question has effective weight > 0.
 *   PV-016: every option of every scored choice question has Points set
 *           (rating-style questions are exempt — they use the option's numeric value).
 *   PV-017: every scored number/decimal/currency question has both min and max.
 *   PV-018: score min < score max for each scored number question.
 *
 * Skipped for non-survey forms and non-weighted surveys.
 */
function validateWeightedScoring(state: DesignerState, issues: ValidationIssue[]): void {
  if (state.form?.formType !== 'Survey' || state.form.scoringMode !== 'Weighted') return;

  const fields = Object.values(state.fields);

  // PV-015: at least one scorable question must have effective weight > 0.
  const hasActivelyScoredField = fields.some(
    f => (SCORABLE_OPTION_FIELD_TYPES.has(f.fieldType) || SCORABLE_NUMBER_FIELD_TYPES.has(f.fieldType))
      && effectiveWeight(f.scoreWeight) > 0,
  );
  if (!hasActivelyScoredField) {
    issues.push({
      code: 'PV-015',
      message: 'A Weighted survey must have at least one scorable question with a weight greater than 0. '
        + 'Set a Weight on a dropdown, radio, multi-select, or number question.',
      severity: 'error',
    });
  }

  for (const field of fields) {
    const weight = effectiveWeight(field.scoreWeight);
    if (weight <= 0) continue; // excluded from scoring

    // PV-016: every option of a scored choice question must have Points (except rating-style).
    if (SCORABLE_OPTION_FIELD_TYPES.has(field.fieldType)) {
      const isRating = field.radioRenderStyle === 'rating';
      if (!isRating && field.options.some(o => o.scorePoints == null)) {
        issues.push({
          code: 'PV-016',
          message: `Field "${field.label || field.code}" is scored (weight ${weight}) but `
            + 'one or more options are missing a Points value. Set Points on every option, '
            + 'or change this field to rating style.',
          severity: 'error',
        });
      }
    }

    // PV-017: scored number questions must have both min and max.
    if (SCORABLE_NUMBER_FIELD_TYPES.has(field.fieldType)) {
      const hasBoth = field.scoreMin != null && field.scoreMax != null;
      if (!hasBoth) {
        issues.push({
          code: 'PV-017',
          message: `Field "${field.label || field.code}" is a scored number question but `
            + 'Score minimum and Score maximum must both be set.',
          severity: 'error',
        });
        continue; // skip PV-018 when both are absent
      }

      // PV-018: min must be strictly less than max.
      if (field.scoreMin! >= field.scoreMax!) {
        issues.push({
          code: 'PV-018',
          message: `Field "${field.label || field.code}": Score minimum (${field.scoreMin}) `
            + `must be less than Score maximum (${field.scoreMax}).`,
          severity: 'error',
        });
      }
    }
  }
}

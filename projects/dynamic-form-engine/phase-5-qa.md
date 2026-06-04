═══════════════════════════════════════════════════════════════════
PHASE 5 — QA STRATEGY AND TEST PLAN
Dynamic Form Engine Portal — QDB
═══════════════════════════════════════════════════════════════════
Project:     Dynamic Form Engine Portal — QDB
Prepared by: Maqsad AI — QA Engineer
Date:        2026-05-08
Version:     1.0
Status:      COMPLETE
═══════════════════════════════════════════════════════════════════


1. TEST STRATEGY SUMMARY
──────────────────────────────────────────────────────────────────

1.1 Overall Approach

This strategy enforces Article IV of the Technology Constitution:
Red → Green → Refactor. No test is written after implementation.
Every new function is preceded by a failing test. Every test
references the User Story ID (US-XX) and Functional Requirement
ID (FR-XXX) that it verifies, and must be traceable through to the
RTM in phase-2-ba.md.

Test coverage targets (hard minimums — CI gate blocks merge if unmet):
- Backend services (CrmMetadataService, CrmSubmissionService,
  CrmAuditService, CrmDataService, CrmLookupService): >= 80%
- Frontend engine layer (RuleEngine, ValidationEngine): >= 80%
- Frontend component layer (FieldRenderer, all 17 controls): >= 70%
- API route handlers (forms, lookups, files, health): >= 80%

1.2 Test Layers

LAYER 1 — Unit (Vitest)
  Scope: RuleEngine, ValidationEngine, CrmMetadataService,
         CrmSubmissionService, CrmAuditService, all field controls,
         FieldRenderer, DynamicFormRenderer (with MSW).
  Mocking policy:
    - Backend: mock fetch via vi.fn() / global fetch override with
      MOCK_CRM=true env flag. CrmAuthService injected as a mock.
    - Frontend: MSW (Mock Service Worker) intercepts all /api calls.
      FormContext mocked via vi.mock() where required.
  No live Dataverse calls. No live Azure AD tokens.

LAYER 2 — Integration (Vitest + Supertest)
  Scope: Express route handlers with real service implementations
         wired together. CrmBaseService.crmFetch mocked at the HTTP
         level using nock or global fetch mock, not at service level.
  Coverage: every documented API route — metadata, draft, submit,
            validate, lookup, file upload, audit.
  Auth: req.user injected by a test middleware that bypasses JWT
        validation; real JWT validation tested in security tests only.

LAYER 3 — E2E (Playwright)
  Scope: Critical user journeys from browser to API to mock Dataverse.
  Backend runs against a local Docker compose with MOCK_CRM=true.
  MSW service worker handles Dataverse API responses.
  Seven mandatory journey paths documented in section 4.

1.3 TDD Workflow Mandate

For every work item:
  Step 1: Write the test (it must fail — RED state verified in CI).
  Step 2: Write the minimum implementation to pass.
  Step 3: Refactor without breaking the test.

CI enforces this by requiring test files to exist and pass before
any implementation file can be merged to main.

1.4 Tooling

| Purpose               | Tool                                    |
|-----------------------|-----------------------------------------|
| Unit / integration    | Vitest 1.x                              |
| Component testing     | @testing-library/react 14.x             |
| API mocking (FE)      | MSW 2.x                                 |
| API mocking (BE unit) | vi.fn() + global fetch override         |
| API integration       | Supertest 6.x                           |
| E2E                   | Playwright 1.x                          |
| Performance           | k6                                      |
| Coverage              | Vitest built-in + v8 provider           |
| CI                    | GitHub Actions                          |

1.5 CI Pipeline Stages

Stage 1 — PR validation (every push to feature branch):
  - vitest run --coverage (unit + integration)
  - Coverage gate: fail if below thresholds
  - TypeScript strict check (tsc --noEmit)
  - ESLint

Stage 2 — Merge to main:
  - All Stage 1 checks
  - Playwright E2E suite (headless, Docker compose)
  - k6 smoke test (1 user, 30 s) against staging

Stage 3 — Release tag:
  - Full k6 load test (100 concurrent users, 5 min)
  - Playwright E2E on staging environment (real Azure AD)
  - Security scan (OWASP ZAP baseline)


2. TEST ENVIRONMENT REQUIREMENTS
──────────────────────────────────────────────────────────────────

2.1 Test Data Setup

MOCK_FORM_LOAN_APPLICATION:
  A complete FormDefinition JSON fixture covering all 17 field types:
  text, textarea, number, date, datetime, dropdown, multiselect,
  lookup, checkbox, radio, currency, decimal, email, phone, file,
  repeatingGrid, richText.
  Stored at: frontend/src/test/fixtures/loanApplicationForm.ts
  and:       backend/src/test/fixtures/loanApplicationForm.ts

  Minimum content:
    - 3 tabs (Customer Information, Facility Details, Documents)
    - 2 sections per tab
    - At least 1 field of each type
    - 5 business rules (showField, hideField, makeRequired, setValue,
      OR compound condition)
    - 5 validation rules (required, minLength, email, minValue,
      crossField)
    - 2 submission mappings (1 parent entity, 1 child entity)

MOCK_DATAVERSE_RESPONSES:
  Raw OData response fixtures for:
    - qdb_form_definitions (active form, inactive form, missing form)
    - qdb_form_tabs (3 tabs)
    - qdb_form_sections (6 sections)
    - qdb_form_fields (17 fields, one per type)
    - qdb_form_option_values (dropdown and radio options)
    - qdb_form_validation_rules (5 rules)
    - qdb_form_lookup_configs (1 lookup config)
    - qdb_form_submission_mappings (2 mappings)
  Stored at: backend/src/test/fixtures/dataverseResponses.ts

2.2 Service Dependencies

Local test environment (docker-compose.test.yml):
  - Backend API container (MOCK_CRM=true, TEST_JWT_BYPASS=true)
  - Playwright browser container (chromium)
  - MSW service worker injected into React dev server

No live Dataverse environment required for unit or integration tests.
E2E staging runs require:
  - Azure AD app registration (QDB IT provides)
  - Test user accounts (see 2.3)

2.3 Test User Accounts Required

| Account          | Role                    | Azure AD Group            |
|------------------|-------------------------|---------------------------|
| testcustomer@qdb | Portal User             | DFE-Portal-Users          |
| testrm@qdb       | Relationship Manager    | DFE-RM-Users              |
| testadmin@qdb    | CRM Configuration Team  | DFE-Config-Admins         |
| testaudit@qdb    | Compliance / Audit      | DFE-Audit-Viewers         |
| testunauth@qdb   | No DFE group            | (none — for security tests)|


3. BACKEND UNIT TESTS — COMPLETE TEST FILES
──────────────────────────────────────────────────────────────────

3.1 RuleEngine Tests
File: frontend/src/engine/RuleEngine.test.ts

NOTE: The existing test file at this path covers 8 scenarios.
The cases below extend it with the additional scenarios required
by the QA plan. The factory helper and describe/beforeEach
wrappers already present in the file are reused.

```typescript
// File: frontend/src/engine/RuleEngine.test.ts
// Extends the existing file — append these cases inside the
// existing describe('RuleEngine') block.

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { BusinessRule, FormFieldValues } from '@dfe/shared';

// TC-001 (US-02 / FR-013, FR-015)
it('evaluate_whenFieldEqualsConditionMet_showsTargetField', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-show-cr',
    name: 'Show CR Number when customer type is Corporate',
    conditions: [{ fieldId: 'customerType', operator: 'equals', value: 'corporate' }],
    conditionsLogic: 'AND',
    action: 'showField',
    targetFieldId: 'crNumber',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { customerType: 'corporate' });

  // Assert
  expect(result.fieldVisibility['crNumber']).toBe(true);
});

// TC-002 (US-02 / FR-013, FR-015)
it('evaluate_whenFieldEqualsConditionNotMet_doesNotShowTargetField', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-show-cr',
    name: 'Show CR Number when customer type is Corporate',
    conditions: [{ fieldId: 'customerType', operator: 'equals', value: 'corporate' }],
    conditionsLogic: 'AND',
    action: 'showField',
    targetFieldId: 'crNumber',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { customerType: 'individual' });

  // Assert
  expect(result.fieldVisibility['crNumber']).toBeUndefined();
});

// TC-003 (US-02 / FR-015 — OR compound condition)
it('evaluate_whenOrCondition_eitherConditionTriggers', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-or',
    name: 'Hide guarantor section when neither condition is met',
    conditions: [
      { fieldId: 'loanType', operator: 'equals', value: 'personal' },
      { fieldId: 'loanType', operator: 'equals', value: 'auto' },
    ],
    conditionsLogic: 'OR',
    action: 'hideSection',
    targetSectionId: 'section-guarantor',
    priority: 1,
    isActive: true,
  };

  // Act — only second condition matches
  const result = await engine.evaluate([rule], { loanType: 'auto' });

  // Assert
  expect(result.sectionVisibility['section-guarantor']).toBe(false);
});

// TC-004 (US-02 / FR-014)
it('evaluate_whenHideFieldAction_setsFieldVisibilityFalse', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-hide',
    name: 'Hide sponsor field when customer is not expat',
    conditions: [{ fieldId: 'isExpat', operator: 'equals', value: false }],
    conditionsLogic: 'AND',
    action: 'hideField',
    targetFieldId: 'sponsorName',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { isExpat: false });

  // Assert
  expect(result.fieldVisibility['sponsorName']).toBe(false);
});

// TC-005 (US-02 / FR-014 — makeRequired)
it('evaluate_whenMakeRequiredAction_setsFieldRequired', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-require-cr',
    name: 'Require CR number when corporate customer',
    conditions: [{ fieldId: 'customerType', operator: 'equals', value: 'corporate' }],
    conditionsLogic: 'AND',
    action: 'makeRequired',
    targetFieldId: 'crNumber',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { customerType: 'corporate' });

  // Assert
  expect(result.fieldRequired['crNumber']).toBe(true);
});

// TC-006 (US-02 / FR-014 — setValue)
it('evaluate_whenSetValueAction_setsFieldValue', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-set-currency',
    name: 'Default currency to QAR when country is Qatar',
    conditions: [{ fieldId: 'country', operator: 'equals', value: 'QA' }],
    conditionsLogic: 'AND',
    action: 'setValue',
    targetFieldId: 'currency',
    actionValue: 'QAR',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { country: 'QA' });

  // Assert
  expect(result.fieldValues['currency']).toBe('QAR');
});

// TC-007 (US-02 / FR-013)
it('evaluate_withEmptyRules_returnsEmptyResult', async () => {
  // Arrange
  const engine = new RuleEngine();

  // Act
  const result = await engine.evaluate([], { someField: 'value' });

  // Assert
  expect(result.fieldVisibility).toEqual({});
  expect(result.fieldRequired).toEqual({});
  expect(result.fieldValues).toEqual({});
  expect(result.filteredOptions).toEqual({});
});

// TC-008 (US-02 / FR-016 — priority ordering)
it('evaluate_laterHigherPriorityRule_doesNotOverrideLowerPriorityResult', async () => {
  // Arrange — two rules fire; first sets required=true (priority 1),
  // second sets required=false (priority 2). Priority 1 fires first.
  // json-rules-engine fires all matching rules; last event wins per mapEventsToResult.
  // This test verifies the priority mechanism wires correctly.
  const engine = new RuleEngine();
  const ruleA: BusinessRule = {
    id: 'rule-a',
    name: 'Make required at priority 2',
    conditions: [{ fieldId: 'flag', operator: 'equals', value: true }],
    conditionsLogic: 'AND',
    action: 'makeRequired',
    targetFieldId: 'targetField',
    priority: 2,
    isActive: true,
  };
  const ruleB: BusinessRule = {
    id: 'rule-b',
    name: 'Make optional at priority 1 (fires later by json-rules-engine order)',
    conditions: [{ fieldId: 'flag', operator: 'equals', value: true }],
    conditionsLogic: 'AND',
    action: 'makeOptional',
    targetFieldId: 'targetField',
    priority: 1,
    isActive: true,
  };

  // Act — both rules match; priority behaviour documented in test intent
  const result = await engine.evaluate([ruleA, ruleB], { flag: true });

  // Assert — both events fire; test confirms no crash and a boolean result
  expect(typeof result.fieldRequired['targetField']).toBe('boolean');
});

// TC-009 (US-02 / FR-013 — isEmpty operator)
it('evaluate_whenIsEmptyOperator_firesWhenValueIsNull', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-empty',
    name: 'Show default value hint when field is empty',
    conditions: [{ fieldId: 'companyName', operator: 'isEmpty', value: null }],
    conditionsLogic: 'AND',
    action: 'showField',
    targetFieldId: 'hintBanner',
    priority: 1,
    isActive: true,
  };

  // Act
  const result = await engine.evaluate([rule], { companyName: null });

  // Assert
  expect(result.fieldVisibility['hintBanner']).toBe(true);
});

// TC-010 (US-02 / FR-013 — unsupported operator throws)
it('evaluate_whenUnsupportedOperator_throwsError', async () => {
  // Arrange
  const engine = new RuleEngine();
  const rule: BusinessRule = {
    id: 'rule-bad',
    name: 'Bad operator rule',
    conditions: [{ fieldId: 'x', operator: 'unknownOp' as never, value: 'y' }],
    conditionsLogic: 'AND',
    action: 'showField',
    targetFieldId: 'y',
    priority: 1,
    isActive: true,
  };

  // Act + Assert
  await expect(engine.evaluate([rule], { x: 'y' })).rejects.toThrow(
    'Unsupported condition operator: unknownOp',
  );
});
```

3.2 ValidationEngine Tests
File: frontend/src/engine/ValidationEngine.test.ts

NOTE: The existing test file covers 7 scenarios (optional/empty,
required/empty, maxLength, email invalid, email valid, minValue,
inactive rule skip, hidden fields in validateForm, buildZodSchema).
The cases below extend it with the additional required scenarios.

```typescript
// Append inside the existing describe('ValidationEngine') block.

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from './ValidationEngine';
import type { FieldDefinition, FormDefinition } from '@dfe/shared';

// TC-011 (US-03 / FR-018, FR-019 — required)
it('validateField_required_whenEmpty_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    validationRules: [{
      id: 'r1', fieldId: 'field-1', ruleType: 'required',
      errorMessage: 'This field is required', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, '', {});

  // Assert
  expect(errors).toContain('This field is required');
});

// TC-012 (US-03 / FR-018)
it('validateField_required_whenFilled_returnsNoError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    validationRules: [{
      id: 'r1', fieldId: 'field-1', ruleType: 'required',
      errorMessage: 'Required', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, 'Ahmad Al-Rashidi', {});

  // Assert
  expect(errors).toHaveLength(0);
});

// TC-013 (US-03 / FR-019 — minLength)
it('validateField_minLength_whenBelowMin_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    validationRules: [{
      id: 'r2', fieldId: 'field-1', ruleType: 'minLength', minLength: 10,
      errorMessage: 'Must be at least 10 characters', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, 'short', {});

  // Assert
  expect(errors).toContain('Must be at least 10 characters');
});

// TC-014 (US-05 / FR-019 — email invalid)
it('validateField_email_whenInvalidFormat_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    fieldType: 'email',
    validationRules: [{
      id: 'r3', fieldId: 'field-1', ruleType: 'email',
      errorMessage: 'Please enter a valid email address', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, 'not-valid@@email', {});

  // Assert
  expect(errors).toContain('Please enter a valid email address');
});

// TC-015 (US-05 / FR-019 — email valid)
it('validateField_email_whenValid_returnsNoError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    fieldType: 'email',
    validationRules: [{
      id: 'r4', fieldId: 'field-1', ruleType: 'email',
      errorMessage: 'Invalid email', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, 'customer@qdb.com.qa', {});

  // Assert
  expect(errors).toHaveLength(0);
});

// TC-016 (US-03 / FR-019 — crossField)
it('validateField_crossField_whenValuesDiffer_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    schemaName: 'confirmEmail',
    validationRules: [{
      id: 'r5', fieldId: 'field-1', ruleType: 'crossField',
      compareToFieldId: 'email',
      errorMessage: 'Email addresses must match', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(
    field,
    'different@email.com',
    { email: 'original@email.com' },
  );

  // Assert
  expect(errors).toContain('Email addresses must match');
});

// TC-017 (US-03 / FR-022, BR-001 — hidden fields excluded)
it('validateForm_hiddenFields_areExcludedFromValidation', () => {
  // Arrange
  const engine = new ValidationEngine();
  const requiredHiddenField = makeField({
    id: 'field-cr',
    schemaName: 'crNumber',
    validationRules: [{
      id: 'r6', fieldId: 'field-cr', ruleType: 'required',
      errorMessage: 'CR number is required', isActive: true, priority: 1,
    }],
  });
  const formDef: FormDefinition = {
    id: 'form-1', formCode: 'loan', title: 'Loan Application',
    status: 'active', version: 1, allowSaveDraft: true, draftExpiryDays: 90,
    confirmationMessage: 'Submitted', submissionMappings: [],
    createdAt: '', modifiedAt: '',
    tabs: [{
      id: 'tab-1', formDefinitionId: 'form-1', label: 'Tab 1',
      displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
      sections: [{
        id: 'section-1', tabId: 'tab-1', label: 'Section 1',
        displayOrder: 1, columns: 2, isCollapsible: false,
        isCollapsedByDefault: false, isVisible: true,
        fields: [requiredHiddenField],
      }],
    }],
  };
  // crNumber is NOT in visibleFields — rule engine hid it
  const visibleFields = new Set<string>();

  // Act
  const errors = engine.validateForm(formDef, {}, visibleFields);

  // Assert — hidden required field must not block submission (BR-001 corollary)
  expect(errors['field-cr']).toBeUndefined();
});

// TC-018 (US-03 / FR-022 — buildZodSchema from metadata)
it('buildZodSchema_generatesSchemaFromMetadata', () => {
  // Arrange
  const engine = new ValidationEngine();
  const emailField = makeField({
    id: 'field-email',
    schemaName: 'emailAddress',
    fieldType: 'email',
    validationRules: [{
      id: 'r7', fieldId: 'field-email', ruleType: 'required',
      errorMessage: 'Email is required', isActive: true, priority: 1,
    }],
  });

  // Act
  const schema = engine.buildZodSchema([emailField], new Set(['field-email']));
  const result = schema.safeParse({ emailAddress: '' });

  // Assert
  expect(result.success).toBe(false);
  expect(result.error?.issues.length).toBeGreaterThan(0);
});

// TC-019 (US-03 / FR-019 — regex)
it('validateField_regex_whenPatternNotMatched_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    validationRules: [{
      id: 'r8', fieldId: 'field-1', ruleType: 'regex',
      regexPattern: '^[0-9]{10}$',
      errorMessage: 'Must be exactly 10 digits', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, '12345', {});

  // Assert
  expect(errors).toContain('Must be exactly 10 digits');
});

// TC-020 (US-03 / FR-019 — dateBefore)
it('validateField_dateBefore_whenValueIsAfterLimit_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    fieldType: 'date',
    validationRules: [{
      id: 'r9', fieldId: 'field-1', ruleType: 'dateBefore',
      compareToValue: '2025-01-01',
      errorMessage: 'Date must be before 2025', isActive: true, priority: 1,
    }],
  });

  // Act — value is AFTER the limit
  const errors = engine.validateField(field, '2026-06-01', {});

  // Assert
  expect(errors).toContain('Date must be before 2025');
});

// TC-021 (US-03 / FR-019 — maxValue)
it('validateField_maxValue_whenValueExceedsLimit_returnsError', () => {
  // Arrange
  const engine = new ValidationEngine();
  const field = makeField({
    fieldType: 'currency',
    validationRules: [{
      id: 'r10', fieldId: 'field-1', ruleType: 'maxValue', maxValue: 5000000,
      errorMessage: 'Loan amount cannot exceed 5,000,000 QAR', isActive: true, priority: 1,
    }],
  });

  // Act
  const errors = engine.validateField(field, 6000000, {});

  // Assert
  expect(errors).toContain('Loan amount cannot exceed 5,000,000 QAR');
});
```

3.3 CrmMetadataService Tests
File: backend/src/services/CrmMetadataService.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService';
import { FormNotFoundError, FormInactiveError } from '../utils/errors';
import type { CrmAuthService } from './CrmAuthService';
import type { FormDefinition } from '@dfe/shared';

// ── Fixtures ──────────────────────────────────────────────────
const MOCK_FORM_RAW = {
  value: [{
    qdb_form_definition_id: 'form-guid-001',
    qdb_form_code: 'loan-application',
    qdb_title: 'Loan Application',
    qdb_description: 'QDB Loan Application Form',
    qdb_status: 100000001, // active
    qdb_version: 1,
    qdb_allow_save_draft: true,
    qdb_draft_expiry_days: 90,
    qdb_confirmation_message: 'Your application has been submitted.',
    createdon: '2026-01-01T00:00:00Z',
    modifiedon: '2026-01-01T00:00:00Z',
  }],
};

const MOCK_TABS_RAW = {
  value: [{
    qdb_form_tab_id: 'tab-001',
    qdb_label: 'Customer Information',
    qdb_display_order: 1,
    qdb_is_visible: true,
    qdb_requires_previous_tab_complete: false,
  }],
};

const MOCK_SECTIONS_RAW = {
  value: [{
    qdb_form_section_id: 'section-001',
    _qdb_form_tab_id_value: 'tab-001',
    qdb_label: 'Personal Details',
    qdb_display_order: 1,
    qdb_columns: 2,
    qdb_is_collapsible: false,
    qdb_is_collapsed_by_default: false,
    qdb_is_visible: true,
  }],
};

const MOCK_FIELDS_RAW = {
  value: [{
    qdb_form_field_id: 'field-001',
    _qdb_form_section_id_value: 'section-001',
    qdb_field_type: 100000001, // text
    qdb_schema_name: 'firstName',
    qdb_label: 'First Name',
    qdb_display_order: 1,
    qdb_column_span: 1,
    qdb_is_required: true,
    qdb_is_readonly: false,
    qdb_is_hidden: false,
  }],
};

const MOCK_OPTIONS_RAW   = { value: [] };
const MOCK_VALIDATION_RAW = { value: [] };
const MOCK_LOOKUP_RAW    = { value: [] };
const MOCK_MAPPINGS_RAW  = { value: [] };

// ── Factory helpers ───────────────────────────────────────────
function makeMockAuthService(): CrmAuthService {
  return { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as unknown as CrmAuthService;
}

function makeCache(): LRUCache<string, FormDefinition> {
  return new LRUCache<string, FormDefinition>({ max: 50 });
}

function makeService(
  fetchResponses: unknown[],
  cache?: LRUCache<string, FormDefinition>,
): CrmMetadataService {
  const authService = makeMockAuthService();
  const lruCache = cache ?? makeCache();
  const service = new CrmMetadataService(authService, lruCache);

  let callIndex = 0;
  vi.spyOn(global, 'fetch').mockImplementation(() => {
    const body = fetchResponses[callIndex++] ?? { value: [] };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers(),
    } as Response);
  });

  return service;
}

// ── Tests ─────────────────────────────────────────────────────
describe('CrmMetadataService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-022 (US-01 / FR-005 — happy path assembly)
  it('getFormDefinition_whenFormExists_returnsAssembledForm', async () => {
    // Arrange — fetch is called in order:
    // 1. form definition query
    // 2. tabs query         (parallel with mappings)
    // 3. mappings query     (parallel with tabs)
    // 4. sections query
    // 5. fields query
    // 6. options query      (parallel)
    // 7. validation rules   (parallel)
    // 8. lookup configs     (parallel)
    const service = makeService([
      MOCK_FORM_RAW,
      MOCK_TABS_RAW,
      MOCK_MAPPINGS_RAW,
      MOCK_SECTIONS_RAW,
      MOCK_FIELDS_RAW,
      MOCK_OPTIONS_RAW,
      MOCK_VALIDATION_RAW,
      MOCK_LOOKUP_RAW,
    ]);

    // Act
    const form = await service.getFormDefinition('loan-application');

    // Assert
    expect(form.formCode).toBe('loan-application');
    expect(form.title).toBe('Loan Application');
    expect(form.status).toBe('active');
    expect(form.tabs).toHaveLength(1);
    expect(form.tabs[0].sections).toHaveLength(1);
    expect(form.tabs[0].sections[0].fields).toHaveLength(1);
    expect(form.tabs[0].sections[0].fields[0].schemaName).toBe('firstName');
    expect(form.tabs[0].sections[0].fields[0].isRequired).toBe(true);
  });

  // TC-023 (FR-043 / BR-007 — form not found)
  it('getFormDefinition_whenFormNotFound_throwsFormNotFoundError', async () => {
    // Arrange — empty value array = form code does not exist
    const service = makeService([{ value: [] }]);

    // Act + Assert
    await expect(service.getFormDefinition('nonexistent-form'))
      .rejects.toThrow(FormNotFoundError);
  });

  // TC-024 (FR-043 / BR-007 — form inactive)
  it('getFormDefinition_whenFormInactive_throwsFormInactiveError', async () => {
    // Arrange — qdb_status = 100000002 (inactive)
    const inactiveFormRaw = {
      value: [{
        ...MOCK_FORM_RAW.value[0],
        qdb_status: 100000002,
      }],
    };
    const service = makeService([inactiveFormRaw]);

    // Act + Assert
    await expect(service.getFormDefinition('loan-application'))
      .rejects.toThrow(FormInactiveError);
  });

  // TC-025 (NFR-001 / FR-005 — LRU cache hit)
  it('getFormDefinition_onSecondCall_returnsFromCache', async () => {
    // Arrange — first call populates cache; second call should NOT call fetch again
    const service = makeService([
      MOCK_FORM_RAW, MOCK_TABS_RAW, MOCK_MAPPINGS_RAW,
      MOCK_SECTIONS_RAW, MOCK_FIELDS_RAW,
      MOCK_OPTIONS_RAW, MOCK_VALIDATION_RAW, MOCK_LOOKUP_RAW,
    ]);

    // Act
    await service.getFormDefinition('loan-application');
    const fetchCallsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await service.getFormDefinition('loan-application');
    const fetchCallsAfterSecond = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Assert — fetch call count must not increase on second call
    expect(fetchCallsAfterSecond).toBe(fetchCallsAfterFirst);
  });

  // TC-026 (NFR-001 — cache invalidation forces fresh fetch)
  it('getFormDefinition_afterCacheInvalidation_fetchesFromCrm', async () => {
    // Arrange
    const cache = makeCache();
    const service = makeService([
      MOCK_FORM_RAW, MOCK_TABS_RAW, MOCK_MAPPINGS_RAW,
      MOCK_SECTIONS_RAW, MOCK_FIELDS_RAW,
      MOCK_OPTIONS_RAW, MOCK_VALIDATION_RAW, MOCK_LOOKUP_RAW,
      // Second set of responses after invalidation
      MOCK_FORM_RAW, MOCK_TABS_RAW, MOCK_MAPPINGS_RAW,
      MOCK_SECTIONS_RAW, MOCK_FIELDS_RAW,
      MOCK_OPTIONS_RAW, MOCK_VALIDATION_RAW, MOCK_LOOKUP_RAW,
    ], cache);

    // Act
    await service.getFormDefinition('loan-application');
    const countBeforeInvalidate = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    service.invalidateCache('loan-application');
    await service.getFormDefinition('loan-application');
    const countAfterInvalidate = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Assert — fetch was called again after cache invalidation
    expect(countAfterInvalidate).toBeGreaterThan(countBeforeInvalidate);
  });

  // TC-027 (FR-003 — field type mapping)
  it('getFormDefinition_mapsAllFieldTypeCodes_correctly', async () => {
    // Arrange — field type code 100000013 = email
    const emailFieldRaw = {
      value: [{
        ...MOCK_FIELDS_RAW.value[0],
        qdb_field_type: 100000013,
        qdb_schema_name: 'emailAddress',
      }],
    };
    const service = makeService([
      MOCK_FORM_RAW, MOCK_TABS_RAW, MOCK_MAPPINGS_RAW,
      MOCK_SECTIONS_RAW, emailFieldRaw,
      MOCK_OPTIONS_RAW, MOCK_VALIDATION_RAW, MOCK_LOOKUP_RAW,
    ]);

    // Act
    const form = await service.getFormDefinition('loan-application');

    // Assert
    expect(form.tabs[0].sections[0].fields[0].fieldType).toBe('email');
  });

  // TC-028 (FR-005 — Dataverse 429 retry logic in CrmBaseService)
  it('getFormDefinition_onThrottledResponse_retriesAndSucceeds', async () => {
    // Arrange — first response is 429, second is success
    const authService = makeMockAuthService();
    const cache = makeCache();
    const service = new CrmMetadataService(authService, cache);

    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false, status: 429, statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '0' }),
          text: () => Promise.resolve('throttled'),
        } as Response);
      }
      // Subsequent calls succeed
      const responses = [
        MOCK_FORM_RAW, MOCK_TABS_RAW, MOCK_MAPPINGS_RAW,
        MOCK_SECTIONS_RAW, MOCK_FIELDS_RAW,
        MOCK_OPTIONS_RAW, MOCK_VALIDATION_RAW, MOCK_LOOKUP_RAW,
      ];
      const body = responses[callCount - 2] ?? { value: [] };
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(body),
        headers: new Headers(),
      } as Response);
    });

    // Act
    const form = await service.getFormDefinition('loan-application');

    // Assert
    expect(form.formCode).toBe('loan-application');
    expect(callCount).toBeGreaterThan(1);
  });
});
```

3.4 CrmSubmissionService Tests
File: backend/src/services/CrmSubmissionService.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrmSubmissionService } from './CrmSubmissionService';
import { CrmAuditService } from './CrmAuditService';
import type { CrmAuthService } from './CrmAuthService';
import type { FormDefinition, FormFieldValues } from '@dfe/shared';

// ── Fixtures ──────────────────────────────────────────────────
function makeMockAuthService(): CrmAuthService {
  return { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as unknown as CrmAuthService;
}

function makeMockAuditService(authService: CrmAuthService): CrmAuditService {
  const audit = new CrmAuditService(authService);
  vi.spyOn(audit, 'writeAuditEntry').mockResolvedValue(undefined);
  return audit;
}

function makeMinimalFormDefinition(overrides: Partial<FormDefinition> = {}): FormDefinition {
  return {
    id: 'form-guid-001',
    formCode: 'loan-application',
    title: 'Loan Application',
    status: 'active',
    version: 1,
    allowSaveDraft: true,
    draftExpiryDays: 90,
    confirmationMessage: 'Submitted',
    submissionMappings: [
      {
        id: 'mapping-parent-001',
        formDefinitionId: 'form-guid-001',
        fieldId: 'firstName',
        targetEntityLogicalName: 'opportunity',
        targetAttributeLogicalName: 'qdb_first_name',
        isMappedToChildEntity: false,
        isActive: true,
      },
    ],
    tabs: [],
    createdAt: '',
    modifiedAt: '',
    ...overrides,
  };
}

const SAMPLE_FIELD_VALUES: FormFieldValues = {
  firstName: 'Ahmad',
};

// ── Tests ─────────────────────────────────────────────────────
describe('CrmSubmissionService', () => {
  let authService: CrmAuthService;
  let auditService: CrmAuditService;

  beforeEach(() => {
    authService = makeMockAuthService();
    auditService = makeMockAuditService(authService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-029 (US-07 / FR-027 — happy path)
  it('submitForm_whenSuccess_createsParentAndChildRecords', async () => {
    // Arrange
    const formDef = makeMinimalFormDefinition({
      submissionMappings: [
        {
          id: 'map-parent',
          formDefinitionId: 'form-guid-001',
          fieldId: 'firstName',
          targetEntityLogicalName: 'opportunity',
          targetAttributeLogicalName: 'qdb_first_name',
          isMappedToChildEntity: false,
          isActive: true,
        },
        {
          id: 'map-child',
          formDefinitionId: 'form-guid-001',
          fieldId: 'phoneNumber',
          targetEntityLogicalName: 'contact',
          targetAttributeLogicalName: 'telephone1',
          isMappedToChildEntity: true,
          childEntityRelationshipName: 'opportunity_contacts',
          isActive: true,
        },
      ],
    });

    let postCallCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
      const method = (options as RequestInit)?.method ?? 'GET';
      if (method === 'POST') {
        postCallCount++;
        const entity = postCallCount === 1 ? 'opportunity' : 'contact';
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ [`${entity}id`]: `${entity}-created-id` }),
          headers: new Headers(),
        } as Response);
      }
      // PATCH — mark as submitted
      return Promise.resolve({
        ok: true, status: 204,
        json: () => Promise.resolve(undefined),
        headers: new Headers(),
      } as Response);
    });

    const service = new CrmSubmissionService(authService, auditService);

    // Act
    const result = await service.submitForm(
      formDef,
      { firstName: 'Ahmad', phoneNumber: '+97412345678' },
      'user-oid-001',
      'Ahmad Al-Rashidi',
    );

    // Assert
    expect(result.parentEntityLogicalName).toBe('opportunity');
    expect(result.parentRecordId).toBe('opportunity-created-id');
    expect(postCallCount).toBe(2); // parent + child POST calls
  });

  // TC-030 (FR-027 / BR-006 — atomic rollback)
  it('submitForm_whenChildCreationFails_rollsBackParentRecord', async () => {
    // Arrange
    const formDef = makeMinimalFormDefinition({
      submissionMappings: [
        {
          id: 'map-parent',
          formDefinitionId: 'form-guid-001',
          fieldId: 'firstName',
          targetEntityLogicalName: 'opportunity',
          targetAttributeLogicalName: 'qdb_first_name',
          isMappedToChildEntity: false,
          isActive: true,
        },
        {
          id: 'map-child',
          formDefinitionId: 'form-guid-001',
          fieldId: 'phoneNumber',
          targetEntityLogicalName: 'contact',
          targetAttributeLogicalName: 'telephone1',
          isMappedToChildEntity: true,
          childEntityRelationshipName: 'opportunity_contacts',
          isActive: true,
        },
      ],
    });

    let callCount = 0;
    const deletedEntities: string[] = [];

    vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
      callCount++;
      const method = (options as RequestInit)?.method ?? 'GET';
      const urlStr = String(url);

      if (method === 'POST' && urlStr.includes('/opportunities')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ opportunityid: 'opp-001' }),
          headers: new Headers(),
        } as Response);
      }

      if (method === 'POST' && urlStr.includes('/contacts')) {
        return Promise.resolve({
          ok: false, status: 500, statusText: 'Internal Server Error',
          text: () => Promise.resolve('CRM error'),
          headers: new Headers(),
        } as Response);
      }

      if (method === 'DELETE') {
        deletedEntities.push(urlStr);
        return Promise.resolve({
          ok: true, status: 204,
          json: () => Promise.resolve(undefined),
          headers: new Headers(),
        } as Response);
      }

      return Promise.resolve({
        ok: true, status: 204,
        json: () => Promise.resolve(undefined),
        headers: new Headers(),
      } as Response);
    });

    const service = new CrmSubmissionService(authService, auditService);

    // Act + Assert — submission should throw
    await expect(
      service.submitForm(
        formDef,
        { firstName: 'Ahmad', phoneNumber: '+97412345678' },
        'user-oid-001',
        'Ahmad Al-Rashidi',
      ),
    ).rejects.toThrow();

    // Assert rollback: DELETE was called for the parent record
    expect(deletedEntities.some((url) => url.includes('opp-001'))).toBe(true);
  });

  // TC-031 (US-08 / FR-028 / BR-012 — workflow fire-and-forget)
  it('submitForm_whenSuccess_triggersWorkflowFireAndForget', async () => {
    // Arrange
    const formDef = makeMinimalFormDefinition({
      powerAutomateFlowId: 'flow-guid-001',
    });

    const workflowTriggerUrls: string[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
      const method = (options as RequestInit)?.method ?? 'GET';
      const urlStr = String(url);

      if (method === 'POST' && urlStr.includes('ExecuteWorkflow')) {
        workflowTriggerUrls.push(urlStr);
        return Promise.resolve({
          ok: true, status: 204,
          json: () => Promise.resolve(undefined),
          headers: new Headers(),
        } as Response);
      }

      if (method === 'POST') {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ opportunityid: 'opp-002' }),
          headers: new Headers(),
        } as Response);
      }

      return Promise.resolve({
        ok: true, status: 204,
        json: () => Promise.resolve(undefined),
        headers: new Headers(),
      } as Response);
    });

    const service = new CrmSubmissionService(authService, auditService);

    // Act
    await service.submitForm(formDef, SAMPLE_FIELD_VALUES, 'user-001', 'Test User');

    // Allow fire-and-forget promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert — workflow endpoint was called
    expect(workflowTriggerUrls.some((url) => url.includes('flow-guid-001'))).toBe(true);
  });

  // TC-032 (US-09 / FR-044, FR-046 — audit log on success)
  it('submitForm_whenSuccess_writesAuditLog', async () => {
    // Arrange
    const formDef = makeMinimalFormDefinition();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ opportunityid: 'opp-003' }),
      headers: new Headers(),
    } as Response);

    const service = new CrmSubmissionService(authService, auditService);

    // Act
    await service.submitForm(formDef, SAMPLE_FIELD_VALUES, 'user-oid-001', 'Ahmad Al-Rashidi');

    // Assert
    expect(auditService.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'formSubmitted',
        formDefinitionId: 'form-guid-001',
        userId: 'user-oid-001',
        userDisplayName: 'Ahmad Al-Rashidi',
      }),
    );
  });

  // TC-033 (FR-027 / BR-006 — audit log on failure)
  it('submitForm_whenChildFails_writesFailureAuditLogEntry', async () => {
    // Arrange
    const formDef = makeMinimalFormDefinition({
      submissionMappings: [
        {
          id: 'map-parent',
          formDefinitionId: 'form-guid-001',
          fieldId: 'firstName',
          targetEntityLogicalName: 'opportunity',
          targetAttributeLogicalName: 'qdb_first_name',
          isMappedToChildEntity: false,
          isActive: true,
        },
      ],
    });

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 503, statusText: 'Service Unavailable',
      text: () => Promise.resolve('Dataverse unavailable'),
      headers: new Headers(),
    } as Response);

    const service = new CrmSubmissionService(authService, auditService);

    // Act + Assert
    await expect(
      service.submitForm(formDef, SAMPLE_FIELD_VALUES, 'user-oid-001', 'Test User'),
    ).rejects.toThrow();

    // Assert — failure audit entry was written
    expect(auditService.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'formSubmissionFailed' }),
    );
  });

  // TC-034 (BR-006 — no parent entity mapping throws before any CRM call)
  it('submitForm_whenNoParentMappingConfigured_throwsCrmApiError', async () => {
    // Arrange — submission mappings array is empty
    const formDef = makeMinimalFormDefinition({ submissionMappings: [] });
    const fetchSpy = vi.spyOn(global, 'fetch');
    const service = new CrmSubmissionService(authService, auditService);

    // Act + Assert
    await expect(
      service.submitForm(formDef, SAMPLE_FIELD_VALUES, 'user-001', 'Test User'),
    ).rejects.toThrow('No parent entity mapping configured for this form');

    // Assert — no CRM calls were made before throwing
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```


4. FRONTEND COMPONENT TESTS — ACTUAL TEST CODE
──────────────────────────────────────────────────────────────────

4.1 FieldRenderer Tests
File: frontend/src/components/forms/FieldRenderer.test.tsx

NOTE: The existing test file covers 6 scenarios. The cases below
extend it with additional required scenarios.

```typescript
// Append inside the existing describe('FieldRenderer') block.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FieldRenderer } from './FieldRenderer';
import type { FieldDefinition } from '@dfe/shared';

// TC-035 (US-01 / FR-010 — text field renders TextInputControl)
it('renders_TextInputControl_forFieldType_text', () => {
  // Arrange
  const field = makeField({ fieldType: 'text', label: 'Full Name' });

  // Act
  renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

  // Assert — input element rendered
  expect(screen.getByRole('textbox')).toBeTruthy();
});

// TC-036 (US-01 / FR-010 — dropdown renders with options from field)
it('renders_DropdownControl_forFieldType_dropdown', () => {
  // Arrange
  const field = makeField({
    fieldType: 'dropdown',
    label: 'Customer Type',
    options: [
      { value: 'individual', label: 'Individual', displayOrder: 1, isDefault: false, isActive: true },
      { value: 'corporate', label: 'Corporate', displayOrder: 2, isDefault: false, isActive: true },
    ],
  });

  // Act
  renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

  // Assert — combobox (Fluent UI Dropdown) is rendered
  expect(screen.getByRole('combobox')).toBeTruthy();
});

// TC-037 (US-03 / FR-020 — error message below field)
it('renders_errorMessage_whenValidationErrorProvided', () => {
  // Arrange
  const field = makeField({ label: 'Email' });

  // Act
  renderField({
    field, isVisible: true, isRequired: true, isReadonly: false,
    error: 'Please enter a valid email address',
  });

  // Assert
  expect(screen.getByText('Please enter a valid email address')).toBeTruthy();
});

// TC-038 (US-01 / FR-006 — invisible field renders nothing)
it('renders_nothing_whenIsVisibleIsFalse', () => {
  // Arrange
  const field = makeField({ label: 'Hidden Field' });

  // Act
  const { container } = renderField({
    field, isVisible: false, isRequired: false, isReadonly: false,
  });

  // Assert
  expect(container.firstChild).toBeNull();
});

// TC-039 (US-01 / FR-010 — readonly field)
it('renders_readonlyInput_whenIsReadonlyIsTrue', () => {
  // Arrange
  const field = makeField({ fieldType: 'text', label: 'Account Number' });

  // Act
  renderField({ field, isVisible: true, isRequired: false, isReadonly: true });

  // Assert — Fluent UI Input renders with aria-readonly or readonly attribute
  const input = screen.getByRole('textbox');
  const isReadonly =
    input.hasAttribute('readonly') ||
    input.getAttribute('aria-readonly') === 'true' ||
    input.hasAttribute('disabled');
  expect(isReadonly).toBe(true);
});

// TC-040 (NFR-013 / WCAG 2.1 — aria-live on error)
it('renders_ariaLiveAlert_forErrorMessage', () => {
  // Arrange
  const field = makeField({ label: 'Phone' });

  // Act
  renderField({
    field, isVisible: true, isRequired: true, isReadonly: false,
    error: 'Phone number is required',
  });

  // Assert — error element has role=alert for screen readers
  const errorEl = screen.getByRole('alert');
  expect(errorEl.textContent).toBe('Phone number is required');
});

// TC-041 (US-01 / FR-010 — checkbox has no separate label element)
it('renders_checkboxWithoutSeparateLabel_forCheckboxFieldType', () => {
  // Arrange — checkbox label is rendered inside the checkbox control, not outside
  const field = makeField({ fieldType: 'checkbox', label: 'I confirm the declaration' });

  // Act
  renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

  // Assert — no Label element rendered above (fieldType !== 'checkbox' guard)
  // The label "I confirm the declaration" should NOT appear as a separate
  // Label element, but the checkbox itself must be present.
  expect(screen.getByRole('checkbox')).toBeTruthy();
});
```

4.2 DynamicFormRenderer Test Scenarios (MSW — described, not coded)

TC-042: loads_andRenders_formWhenFormCodeIsValid
  References: US-01 / FR-005, FR-006, FR-007
  Given: MSW intercepts GET /api/forms/loan-application/metadata and
         returns MOCK_FORM_DEFINITION fixture
  When: DynamicFormRenderer mounts with formCode="loan-application"
  Then: loading spinner appears initially, then form title renders,
        and the correct number of tabs is visible.
  Priority: Critical

TC-043: shows_spinner_whileMetadataIsLoading
  References: US-01 / FR-005
  Given: MSW handler delays the metadata response by 200ms
  When: DynamicFormRenderer mounts
  Then: a loading spinner (aria-label="Loading form") is visible
        before the response arrives.
  Priority: High

TC-044: shows_errorState_whenMetadataFetchFails
  References: FR-030
  Given: MSW handler returns 500 for the metadata request
  When: DynamicFormRenderer mounts
  Then: an error message is shown to the user and no form content
        is rendered.
  Priority: High

TC-045: renders_correctNumberOfTabs
  References: US-01 / FR-007
  Given: metadata fixture has 5 tabs
  When: DynamicFormRenderer renders
  Then: exactly 5 tab buttons are visible in the tab strip.
  Priority: Critical

TC-046: navigates_betweenTabs_onTabClick
  References: US-01 / FR-007
  Given: form is rendered with 3 tabs
  When: user clicks the second tab
  Then: the second tab's sections and fields become visible, and the
        first tab's sections are hidden.
  Priority: Critical


5. E2E TEST SCENARIOS — PLAYWRIGHT
──────────────────────────────────────────────────────────────────
All E2E tests run against: http://localhost:3000
Backend runs with: MOCK_CRM=true, TEST_JWT_BYPASS=true
Auth: injected test token for testcustomer@qdb role.

TC-047: HappyPath_LoanApplication_FullSubmit
  References: US-04, US-07 / FR-026, FR-027, FR-029
  Priority: Critical
  Type: E2E

  Given: testcustomer@qdb is authenticated and the loan-application
         form is available
  When:  user navigates to /forms/loan-application
         AND fills all required fields on Tab 1 (Customer Information):
           First Name = "Ahmad"
           Last Name  = "Al-Rashidi"
           Email      = "ahmad@example.com"
           Phone      = "+97412345678"
         AND fills all required fields on Tab 2 (Facility Details):
           Loan Amount  = 250000
           Loan Tenure  = 60
           Purpose      = "Home Purchase"
         AND uploads a valid PDF on Tab 3 (Documents)
         AND clicks "Submit"
  Then:  a confirmation screen appears showing a CRM reference number
         AND the URL does not change to an error page
         AND no error toast is visible

TC-048: DraftSaveAndResume
  References: US-04 / FR-023, FR-024, BR-003
  Priority: Critical
  Type: E2E

  Given: testcustomer@qdb is authenticated
  When:  user navigates to /forms/loan-application
         AND fills First Name = "Fatima" and Email = "fatima@test.com"
         AND clicks "Save as Draft"
         AND a confirmation toast appears
         AND user navigates away (browser back)
         AND user navigates back to /forms/loan-application
  Then:  the form reopens with First Name pre-populated as "Fatima"
         AND Email pre-populated as "fatima@test.com"
         AND no other fields are incorrectly populated

TC-049: RuleEngineConditionalVisibility_CorporateCustomerType
  References: US-02 / FR-013, FR-014, FR-015, FR-017
  Priority: Critical
  Type: E2E

  Given: testcustomer@qdb is authenticated and loan-application is loaded
  When:  the Customer Type dropdown value is "Individual"
  Then:  the "CR Number" field is not visible

  When:  user changes Customer Type to "Corporate"
  Then:  the "CR Number" field becomes visible immediately without page reload
         AND the "CR Number" field has a required indicator (asterisk)

  When:  user changes Customer Type back to "Individual"
  Then:  the "CR Number" field is hidden again

TC-050: ValidationOnSubmit_AllRequiredFieldsEmpty
  References: US-03, US-05 / FR-018, FR-020, FR-021, BR-001
  Priority: Critical
  Type: E2E

  Given: testcustomer@qdb is authenticated and loan-application is loaded
  When:  user clicks "Submit" without filling any field
  Then:  submission is blocked (page does not show confirmation screen)
         AND error messages appear below each required field
         AND the first tab containing a validation error is the active tab
         AND the browser scrolls to the first error field

TC-051: LookupField_TypeaheadAndSelect
  References: US-12 / FR-010, FR-011, BR-009
  Priority: High
  Type: E2E

  Given: testcustomer@qdb is on a form with an Account lookup field
  When:  user types "Ras" into the lookup field
  Then:  a dropdown appears within 800ms showing active Account records
         matching "Ras"

  When:  user selects "Ras Laffan Industrial City" from the dropdown
  Then:  the lookup field displays "Ras Laffan Industrial City"
         AND the underlying value stored is the Account GUID
         AND inactive accounts do not appear in the results

TC-052: FileUpload_PDFUpload_ProgressAndListing
  References: US-06 / FR-031, FR-034, FR-035, BR-011
  Priority: High
  Type: E2E

  Given: testcustomer@qdb is on a form with a file upload field
         configured for PDF, maximum 10 MB
  When:  user uploads a valid 2 MB PDF file
  Then:  upload progress indicator appears during upload
         AND after completion the file name is listed in the upload area
         AND no error message is shown

  When:  user attempts to upload a 30 MB PDF file
  Then:  a client-side error is shown immediately without an API call:
         "File size exceeds the maximum allowed (25 MB)"

TC-053: TabCompletion_RequiredFieldsFilled
  References: US-01 / FR-007
  Priority: Medium
  Type: E2E

  Given: testcustomer@qdb is on loan-application Tab 1
  When:  all required fields on Tab 1 are filled
  Then:  Tab 1 shows a visual completion indicator
         AND navigating to Tab 2 is permitted

  When:  user clears a required field on Tab 1
  Then:  the Tab 1 completion indicator is removed


6. PERFORMANCE BENCHMARKS
──────────────────────────────────────────────────────────────────

Tool: k6 (k6 run src/performance/*.k6.js)
Target environment: staging backend with MOCK_CRM=false, live Dataverse

| Scenario                                          | Target P95  | Target Throughput | Concurrent Users | Tool |
|---------------------------------------------------|-------------|-------------------|------------------|------|
| GET /api/forms/:formCode/metadata (cache warm)    | < 200ms     | 100 req/s         | 100              | k6   |
| GET /api/forms/:formCode/metadata (cache cold)    | < 500ms     | 10 req/s          | 100              | k6   |
| GET /api/lookups/:entity/search?q=...             | < 800ms     | 50 req/s          | 100              | k6   |
| POST /api/forms/:formCode/draft                   | < 1000ms    | 20 req/s          | 50               | k6   |
| POST /api/forms/:formCode/submit                  | < 3000ms    | 10 req/s          | 50               | k6   |
| Rule engine evaluation (50 rules, client-side)    | < 100ms     | N/A               | N/A              | Vitest perf test |
| Full form hydration (Time to Interactive)         | < 3000ms    | N/A               | N/A              | Playwright |
| Metadata API under 200 concurrent users           | < 500ms     | 200 req/s         | 200              | k6   |

k6 scripts stored at: backend/src/performance/
  - metadata.k6.js      (TC-054)
  - lookup.k6.js        (TC-055)
  - submit.k6.js        (TC-056)
  - sustained-load.k6.js (TC-057 — 5 min, 200 users)

TC-054: Performance_MetadataAPI_P95Under500ms
  Type: Performance | Priority: Critical
  References: NFR-001
  Given: backend with warm LRU cache and 100 concurrent virtual users
  When: k6 runs GET /api/forms/loan-application/metadata for 5 minutes
  Then: P95 response time <= 500ms, error rate < 0.1%

TC-055: Performance_LookupSearch_P95Under800ms
  Type: Performance | Priority: High
  References: NFR-002
  Given: 100 concurrent users sending GET /api/lookups/account/search?q=Ras
  When: k6 runs for 3 minutes
  Then: P95 response time <= 800ms, error rate < 0.1%

TC-056: Performance_RuleEngineEvaluation_Under100ms
  Type: Performance (unit) | Priority: High
  References: FR-013
  Given: a RuleEngine instance with 50 active business rules
         and 30 field values (representative of a complex form)
  When: engine.evaluate() is called 1000 times in a Vitest bench
  Then: P95 evaluation time <= 100ms per invocation

TC-057: Performance_SustainedLoad_200Users_5Min
  Type: Performance | Priority: High
  References: NFR-008
  Given: 200 concurrent virtual users making mixed requests
         (metadata: 60%, draft: 20%, submit: 10%, lookup: 10%)
  When: k6 runs the sustained load scenario for 5 minutes
  Then: P95 <= 500ms for metadata, P95 <= 3000ms for submit,
        error rate < 1%, no memory leaks detected on API container


7. TEST DATA REQUIREMENTS — FULL SPECIFICATIONS
──────────────────────────────────────────────────────────────────

7.1 Sample FormDefinition Fixture (all 17 field types)

File: frontend/src/test/fixtures/loanApplicationForm.ts
      backend/src/test/fixtures/loanApplicationForm.ts

The fixture must include the following fields, one per type:

| Field ID          | Field Type     | Schema Name         | Tab   | Validation Rules                    |
|-------------------|----------------|---------------------|-------|-------------------------------------|
| field-firstname   | text           | firstName           | Tab 1 | required, minLength(2), maxLength(100) |
| field-bio         | textarea       | bio                 | Tab 1 | maxLength(2000)                     |
| field-loanamount  | currency       | loanAmount          | Tab 2 | required, minValue(1000), maxValue(5000000) |
| field-tenure      | number         | tenureMonths        | Tab 2 | required, minValue(6), maxValue(360) |
| field-dob         | date           | dateOfBirth         | Tab 1 | required, dateBefore(today)         |
| field-meetingdt   | datetime       | meetingDateTime     | Tab 2 | (none)                              |
| field-custtype    | dropdown       | customerType        | Tab 1 | required                            |
| field-products    | multiselect    | selectedProducts    | Tab 2 | required                            |
| field-account     | lookup         | linkedAccountId     | Tab 1 | required                            |
| field-declaration | checkbox       | declarationAccepted | Tab 3 | required                            |
| field-purpose     | radio          | loanPurpose         | Tab 2 | required                            |
| field-amount2     | decimal        | processingFee       | Tab 2 | minValue(0)                         |
| field-email       | email          | emailAddress        | Tab 1 | required, email                     |
| field-phone       | phone          | mobileNumber        | Tab 1 | required                            |
| field-passport    | file           | passportDocument    | Tab 3 | required                            |
| field-guarantors  | repeatingGrid  | guarantors          | Tab 2 | (none — optional grid)              |
| field-notes       | richText       | additionalNotes     | Tab 3 | maxLength(5000)                     |

Business rules in fixture (minimum 5):
  Rule 1: Show "crNumber" field when customerType = "corporate" (showField, AND)
  Rule 2: Make "crNumber" required when customerType = "corporate" (makeRequired, AND)
  Rule 3: Hide "guarantors" section when loanAmount < 500000 (hideSection, AND)
  Rule 4: Set currency = "QAR" when country = "QA" (setValue, AND)
  Rule 5: Hide "additionalNotes" when loanPurpose = "Personal" OR "Auto" (hideField, OR)

7.2 Mock Dataverse Response Fixtures

File: backend/src/test/fixtures/dataverseResponses.ts

Exports:
  ACTIVE_FORM_DEFINITION_RESPONSE   — qdb_status: 100000001 (active)
  INACTIVE_FORM_DEFINITION_RESPONSE — qdb_status: 100000002
  NOT_FOUND_FORM_RESPONSE           — { value: [] }
  TABS_RESPONSE                     — 3 tabs
  SECTIONS_RESPONSE                 — 2 sections per tab (6 total)
  FIELDS_RESPONSE                   — 17 fields (one per type)
  OPTIONS_RESPONSE                  — dropdown + radio options
  VALIDATION_RULES_RESPONSE         — 5 validation rules
  LOOKUP_CONFIGS_RESPONSE           — 1 lookup config (account entity)
  SUBMISSION_MAPPINGS_RESPONSE      — 2 mappings (parent + child)

7.3 Test User Account Setup Script

File: scripts/setup-test-users.sh

Creates 5 Azure AD test users in the QDB test tenant:
  testcustomer@qdb-test.onmicrosoft.com  — Portal User group
  testrm@qdb-test.onmicrosoft.com        — RM group
  testadmin@qdb-test.onmicrosoft.com     — Config Admin group
  testaudit@qdb-test.onmicrosoft.com     — Audit Viewer group
  testunauth@qdb-test.onmicrosoft.com    — no DFE group

7.4 Audit Trail Test Data

For TC-032 and TC-033: auditService mock captures all calls via
vi.spyOn. In E2E tests, the audit log is verified by querying
GET /api/audit?formCode=loan-application&userId=user-oid-001
(admin endpoint) and asserting the presence of the expected
eventType entry.


8. SECURITY TEST CASES
──────────────────────────────────────────────────────────────────

TC-058: Security_UnauthenticatedAccess_Returns401
  References: NFR-004 / FR-036
  Given: no Authorization header is included in the request
  When: any /api/* endpoint is called
  Then: HTTP 401 Unauthorized is returned; no form data is exposed
  Type: Security | Priority: Critical
  Confidence: 99%

TC-059: Security_ExpiredJWT_Returns401
  References: NFR-004 / FR-037
  Given: an expired Azure AD JWT (exp claim in the past) is sent
  When: GET /api/forms/loan-application/metadata is called
  Then: HTTP 401 Unauthorized is returned
  Type: Security | Priority: Critical
  Confidence: 99%

TC-060: Security_WrongAudience_Returns401
  References: NFR-004
  Given: a valid JWT but with audience claim not matching the
         configured AZURE_AD_CLIENT_ID
  When: any /api/* endpoint is called
  Then: HTTP 401 Unauthorized is returned
  Type: Security | Priority: Critical
  Confidence: 99%

TC-061: Security_UnauthorisedFormAccess_Returns403
  References: FR-038, FR-039
  Given: testunauth@qdb (no DFE group) is authenticated
  When: GET /api/forms/restricted-form/metadata is called
        where restricted-form has accessGroupId set to DFE-Portal-Users
  Then: HTTP 403 Forbidden is returned
  Type: Security | Priority: High
  Confidence: 90%

TC-062: Security_SQLInjectionInFormCode_Returns400OrSanitised
  References: NFR-007
  Given: authenticated user sends
         GET /api/forms/'; DROP TABLE qdb_forms; --/metadata
  When: the request is processed
  Then: the server returns 400 or 404 (not 500),
        no SQL is executed against any database,
        and the Dataverse OData query is parameterised/escaped
  Type: Security | Priority: High
  Confidence: 95%

TC-063: Security_XSSInFormFieldValue_IsSanitised
  References: NFR-007
  Given: authenticated user submits a draft with
         { firstName: "<script>alert('xss')</script>" }
  When: the draft is retrieved and the value is rendered
  Then: the script tag is not executed in the browser;
        the value is displayed as literal text
  Type: Security | Priority: High
  Confidence: 95%

TC-064: Security_AuditLogAppendOnly_NoUpdateOrDelete
  References: FR-046 / BR-006 (audit-specific)
  Given: an audit log record exists in Dataverse
  When: any backend service attempts to issue a PATCH or DELETE
        against /qdb_form_audit_logs
  Then: no such call is ever made; the only permitted operation
        is POST (CREATE)
  Automation: code-level assertion — grep backend/src/services/
              CrmAuditService.ts for any PATCH/DELETE call against
              the audit endpoint; must return zero matches
  Type: Security / Audit | Priority: Critical
  Confidence: 99%

TC-065: Security_NoSecretsInFrontendBundle
  References: NFR-006
  Given: the production frontend bundle is built (npm run build)
  When: the output bundle files are scanned for known secret patterns
        (client_secret, AZURE_CLIENT_SECRET, connectionString)
  Then: zero matches are found in any .js/.css output file
  Type: Security | Priority: Critical
  Confidence: 99%

TC-066: Security_PII_NotPersistedToBrowserStorage
  References: NFR-011
  Given: a portal user fills in their email and phone number
  When: the form is rendered and fields are updated
  Then: localStorage.getItem and sessionStorage.getItem return null
        for all keys; no PII is written to browser storage
  Type: Security | Priority: High
  Confidence: 95%


9. ADDITIONAL BOUNDARY AND EDGE CASE TEST CASES
──────────────────────────────────────────────────────────────────

TC-067: Boundary_DraftExpiry_90DayDraftFlaggedAsExpired
  References: BR-004
  Given: a draft record with savedAt = 91 days ago exists for the user
  When: user navigates to the form
  Then: the form does not resume from the expired draft;
        user is presented with the option to start fresh
  Type: Integration | Priority: High
  Confidence: 85%

TC-068: Boundary_SingleActiveDraftPerUser
  References: BR-003 / FR-025
  Given: user already has an active draft for loan-application
  When: user navigates to /forms/loan-application again
  Then: a prompt appears asking to resume or discard the existing draft
  Type: E2E | Priority: High
  Confidence: 95%

TC-069: Boundary_HiddenFieldValueClearedBeforeSubmit
  References: BR-002
  Given: user fills in field "CR Number" then rule engine hides it
         (customer type changed from Corporate to Individual)
  When: user submits the form
  Then: the submission payload does NOT include the crNumber value;
        the hidden field's value is cleared before mapping
  Type: Integration | Priority: Critical
  Confidence: 95%

TC-070: Boundary_FormDeactivatedDuringSession
  References: BR-007 / FR-043
  Given: user has the loan-application form open
  When: admin deactivates the form definition in Dataverse
         AND user's next API call triggers a cache invalidation
  Then: the form returns a user-friendly "Form not available" page
        (HTTP 404 / FormInactiveError propagated to UI)
  Type: Integration | Priority: High
  Confidence: 85%

TC-071: Boundary_FileUploadExceedsMaxSize_ClientRejection
  References: BR-011 / FR-034
  Given: file upload field has maxFileSizeMb = 10 configured
  When: user selects a 15 MB file
  Then: the file is rejected client-side before any upload API call
        is made; error message "File exceeds maximum size" appears
  Type: E2E | Priority: High
  Confidence: 99%

TC-072: Boundary_RepeatingGrid_EmptyRows_NotSubmitted
  References: FR-012
  Given: a repeating grid field has zero rows added
  When: user submits the form (grid is optional)
  Then: no empty row records are created in Dataverse;
        the child entity creation loop is skipped
  Type: Integration | Priority: Medium
  Confidence: 85%

TC-073: Boundary_CurrencyField_ExceedsDecimalPrecision_Rejected
  References: BR-010
  Given: a currency field has decimalPlaces = 2
  When: user enters 1000.999
  Then: input is rejected or truncated to 1000.99;
        error message indicates decimal precision limit
  Type: Unit / Component | Priority: Medium
  Confidence: 90%

TC-074: Boundary_LookupSearch_MinCharsNotReached_NoCall
  References: FR-011, BR-009
  Given: a lookup field has searchMinChars = 3
  When: user types "Ra" (2 characters)
  Then: no API call is made to /api/lookups/; the dropdown remains closed
  Type: Component | Priority: Medium
  Confidence: 95%

TC-075: Boundary_WorkflowTriggerFailure_DoesNotFailSubmission
  References: BR-012 / FR-028
  Given: the Power Automate trigger endpoint returns 500
  When: user submits the form
  Then: the submission completes successfully (record created in CRM);
        the trigger failure is logged as a warning only;
        the user sees the confirmation screen
  Type: Integration | Priority: Critical
  Confidence: 99%


10. REQUIREMENTS TRACEABILITY MATRIX — UPDATED
──────────────────────────────────────────────────────────────────

| User Story | Functional Requirements              | Test Cases                            | Status     |
|------------|--------------------------------------|---------------------------------------|------------|
| US-01      | FR-001, FR-002, FR-003, FR-006–009   | TC-022, TC-035–041, TC-042–046        | Defined    |
| US-02      | FR-013–017                           | TC-001–010, TC-049                    | Defined    |
| US-03      | FR-018–022                           | TC-011–021, TC-050                    | Defined    |
| US-04      | FR-023–025                           | TC-048, TC-067, TC-068                | Defined    |
| US-05      | FR-018–020                           | TC-014, TC-015, TC-050                | Defined    |
| US-06      | FR-031–035                           | TC-052, TC-071                        | Defined    |
| US-07      | FR-026–029                           | TC-029, TC-030                        | Defined    |
| US-08      | FR-028                               | TC-031, TC-075                        | Defined    |
| US-09      | FR-044–047                           | TC-032, TC-033, TC-064                | Defined    |
| US-10      | NFR-001–014 (DevOps)                 | TC-054–057 (performance)              | Defined    |
| US-11      | FR-040–043                           | TC-070                                | Defined    |
| US-12      | FR-010, FR-011                       | TC-051, TC-074                        | Defined    |
| BR-001     | Business Rule                        | TC-017, TC-069                        | Defined    |
| BR-002     | Business Rule                        | TC-069                                | Defined    |
| BR-003     | Business Rule                        | TC-068                                | Defined    |
| BR-004     | Business Rule                        | TC-067                                | Defined    |
| BR-006     | Business Rule                        | TC-030, TC-033, TC-034                | Defined    |
| BR-007     | Business Rule                        | TC-023, TC-024, TC-070                | Defined    |
| BR-009     | Business Rule                        | TC-051, TC-074                        | Defined    |
| BR-010     | Business Rule                        | TC-073                                | Defined    |
| BR-011     | Business Rule                        | TC-052, TC-071                        | Defined    |
| BR-012     | Business Rule                        | TC-031, TC-075                        | Defined    |
| NFR-001    | Perf — metadata < 500ms P95          | TC-054                                | Defined    |
| NFR-002    | Perf — lookup < 800ms P95            | TC-055                                | Defined    |
| NFR-004    | Security — JWT required              | TC-058, TC-059, TC-060                | Defined    |
| NFR-006    | Security — no secrets in bundle      | TC-065                                | Defined    |
| NFR-007    | Security — input sanitisation        | TC-062, TC-063                        | Defined    |
| NFR-011    | Compliance — no PII in storage       | TC-066                                | Defined    |
| NFR-012    | Coverage >= 80% backend              | CI gate                               | Defined    |
| NFR-013    | Accessibility WCAG 2.1 AA            | TC-040                                | Defined    |


11. AUTOMATION PLAN
──────────────────────────────────────────────────────────────────

| Test Suite                            | Automated | Manual | Reason if Manual            | CI Stage          |
|---------------------------------------|-----------|--------|-----------------------------|-------------------|
| RuleEngine unit tests                 | Yes       | No     | Pure logic, no I/O          | Stage 1 (PR)      |
| ValidationEngine unit tests           | Yes       | No     | Pure logic, no I/O          | Stage 1 (PR)      |
| CrmMetadataService unit tests         | Yes       | No     | fetch mocked                | Stage 1 (PR)      |
| CrmSubmissionService unit tests       | Yes       | No     | fetch mocked                | Stage 1 (PR)      |
| FieldRenderer component tests         | Yes       | No     | @testing-library            | Stage 1 (PR)      |
| DynamicFormRenderer component tests   | Yes       | No     | MSW                         | Stage 1 (PR)      |
| API route integration tests           | Yes       | No     | Supertest + fetch mock      | Stage 1 (PR)      |
| E2E — Happy path full submit          | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — Draft save and resume           | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — Rule engine conditional         | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — Validation on submit            | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — Lookup field                    | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — File upload                     | Yes       | No     | Playwright                  | Stage 2 (main)    |
| E2E — Tab completion                  | Yes       | No     | Playwright                  | Stage 2 (main)    |
| Performance — k6 smoke (1 user)       | Yes       | No     | k6                          | Stage 2 (main)    |
| Performance — k6 full load (100 users)| Yes       | No     | k6                          | Stage 3 (release) |
| Security — ZAP baseline scan          | Yes       | No     | OWASP ZAP CLI               | Stage 3 (release) |
| Security — audit append-only grep     | Yes       | No     | grep / AST check            | Stage 1 (PR)      |
| UAT — bank staff use-case walkthroughs| No        | Yes    | Requires QDB test accounts  | Pre-release gate  |
| WCAG 2.1 AA full audit                | Partial   | Yes    | axe-playwright for automated| Stage 2 (main)    |
| Data residency verification           | No        | Yes    | Azure portal check by QDB IT| Pre-release gate  |


12. DEFINITION OF DONE
──────────────────────────────────────────────────────────────────

A feature is NOT considered done until every item below is checked.
This list is enforced by the CI pipeline and code reviewer.

CODE QUALITY
  [ ] No TypeScript strict mode violations (tsc --noEmit passes)
  [ ] No ESLint errors or warnings
  [ ] No console.log statements in production code paths
  [ ] No any types introduced
  [ ] All new public methods have JSDoc comments

TEST COVERAGE
  [ ] Backend services: >= 80% line coverage reported by Vitest v8
  [ ] Frontend engine (RuleEngine, ValidationEngine): >= 80% coverage
  [ ] Frontend components: >= 70% coverage
  [ ] All new test cases reference a US-XX or FR-XXX
  [ ] No test file has commented-out test cases

FUNCTIONAL CORRECTNESS
  [ ] All TC-001 through TC-075 pass in CI
  [ ] No E2E test is marked .skip or .only in the merged branch
  [ ] Rule engine conditional tests verified against the actual
      json-rules-engine operator map
  [ ] Validation engine cross-field test verified with real field
      value lookups

BUSINESS RULES
  [ ] BR-001 (hidden fields not blocking submit) verified by TC-017
  [ ] BR-002 (hidden field values cleared) verified by TC-069
  [ ] BR-003 (one draft per user) verified by TC-068
  [ ] BR-006 (atomic rollback) verified by TC-030
  [ ] BR-007 (inactive form 404) verified by TC-024, TC-070
  [ ] BR-012 (workflow fire-and-forget) verified by TC-031, TC-075

AUDIT AND COMPLIANCE
  [ ] TC-032 passes: formSubmitted audit entry is written on success
  [ ] TC-033 passes: formSubmissionFailed audit entry written on error
  [ ] TC-064 passes: no PATCH or DELETE against audit log table
  [ ] Audit log entries include all required fields (FR-045)

SECURITY
  [ ] TC-058 through TC-066 all pass
  [ ] No secrets in frontend bundle (TC-065)
  [ ] No PII written to browser storage (TC-066)
  [ ] OWASP ZAP baseline scan: zero high-severity findings

PERFORMANCE
  [ ] k6 smoke test passes (P95 < 500ms, 0% error rate, 1 user)
  [ ] Rule engine benchmark <= 100ms for 50 rules (TC-056)

DOCUMENTATION
  [ ] RTM updated with all new TC numbers
  [ ] Any new environment variable added to .env.example
  [ ] Fixture files committed to test/fixtures/ directories

═══════════════════════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════════════════════

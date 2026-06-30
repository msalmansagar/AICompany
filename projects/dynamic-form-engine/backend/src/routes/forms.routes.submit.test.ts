import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import 'express-async-errors';
import { createFormsRouter } from './forms.routes.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmDataService } from '../services/CrmDataService.js';
import type { CrmSubmissionService } from '../services/CrmSubmissionService.js';
import type { ExtraParamSpec, FormDefinition, ScopedButton } from '@qdb/shared';

// ── Fixtures ────────────────────────────────────────────────────────────────
function finalSubmitButton(extraParams: ExtraParamSpec[]): ScopedButton {
  return {
    id: 'btn-final',
    placementScope: 'tab',
    placementId: 'tab-1',
    label: 'Submit',
    displayOrder: 0,
    isPrimary: true,
    isVisible: true,
    confirmationRequired: false,
    action: { type: 'finalSubmit', extraParams },
    isActive: true,
  };
}

function makeForm(extraParams: ExtraParamSpec[]): FormDefinition {
  return {
    id: 'form-001',
    formCode: 'test-form',
    title: 'Test Form',
    description: '',
    status: 'active',
    version: 3,
    allowSaveDraft: true,
    showSummaryStep: false,
    draftExpiryDays: 90,
    confirmationMessage: 'Thanks',
    allowInfocardSkip: false,
    infocardCountsInProgress: false,
    infoCards: [],
    submissionMappings: [],
    buttons: [],
    tabs: [
      {
        id: 'tab-1',
        formDefinitionId: 'form-001',
        label: 'Tab 1',
        displayOrder: 0,
        isVisible: true,
        requiresPreviousTabComplete: false,
        sections: [],
        buttons: [finalSubmitButton(extraParams)],
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
  } as unknown as FormDefinition;
}

function buildApp(form: FormDefinition) {
  const submissionService = {
    submitForm: vi.fn().mockResolvedValue({
      parentRecordId: 'r1',
      parentEntityLogicalName: 'contact',
      referenceNumber: 'REF-1',
    }),
  } as unknown as CrmSubmissionService;

  const dataService = {
    getDraft: vi.fn().mockResolvedValue(null),
    deleteDraft: vi.fn(),
  } as unknown as CrmDataService;

  const metadataService = {
    getFormDefinition: vi.fn().mockResolvedValue(form),
  } as unknown as CrmMetadataService;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = {
      oid: 'user-real-001', name: 'Real User', roles: [], aud: 'dev', iss: 'dev', exp: 9_999_999_999,
    };
    next();
  });
  app.use(
    '/api/forms',
    createFormsRouter(metadataService, dataService, submissionService, {} as never, {} as never, null, null, null),
  );
  app.use(errorMiddleware);
  return { app, submissionService };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('POST /forms/:formCode/submit — extra-params wiring (DFE-BTN-001)', () => {
  it('resolves_a_valid_extra_params_button_and_submits (201)', async () => {
    const { app, submissionService } = buildApp(
      makeForm([
        { key: 'channel', source: 'static', staticValue: 'portal' },
        { key: 'submittedBy', source: 'runtimeContext', contextKey: 'userId' },
        { key: 'full', source: 'computed', expression: "concat({first}, ' ', {last})" },
      ]),
    );

    const res = await request(app)
      .post('/api/forms/test-form/submit')
      .send({ formData: { first: 'Ada', last: 'Lovelace' }, submitButtonId: 'btn-final' });

    expect(res.status).toBe(201);
    expect(submissionService.submitForm).toHaveBeenCalledTimes(1);
  });

  it('rejects_an_invalid_computed_expression_with_400', async () => {
    const { app, submissionService } = buildApp(
      makeForm([{ key: 'bad', source: 'computed', expression: '1 +' }]),
    );

    const res = await request(app)
      .post('/api/forms/test-form/submit')
      .send({ formData: {}, submitButtonId: 'btn-final' });

    expect(res.status).toBe(400);
    expect(submissionService.submitForm).not.toHaveBeenCalled();
  });

  it('rejects_an_oversized_envelope_with_413', async () => {
    const { app, submissionService } = buildApp(
      makeForm([{ key: 'big', source: 'static', staticValue: 'x'.repeat(70 * 1024) }]),
    );

    const res = await request(app)
      .post('/api/forms/test-form/submit')
      .send({ formData: {}, submitButtonId: 'btn-final' });

    expect(res.status).toBe(413);
    expect(submissionService.submitForm).not.toHaveBeenCalled();
  });

  it('submits_normally_with_no_submitButtonId (backward compatible)', async () => {
    const { app, submissionService } = buildApp(makeForm([]));

    const res = await request(app).post('/api/forms/test-form/submit').send({ formData: { a: 1 } });

    expect(res.status).toBe(201);
    expect(submissionService.submitForm).toHaveBeenCalledTimes(1);
  });

  it('ignores_an_unknown_submitButtonId_and_still_submits (201)', async () => {
    const { app, submissionService } = buildApp(makeForm([]));

    const res = await request(app)
      .post('/api/forms/test-form/submit')
      .send({ formData: {}, submitButtonId: 'does-not-exist' });

    expect(res.status).toBe(201);
    expect(submissionService.submitForm).toHaveBeenCalledTimes(1);
  });
});

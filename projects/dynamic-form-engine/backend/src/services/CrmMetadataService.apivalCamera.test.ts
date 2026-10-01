import { describe, it, expect } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';

// DFE-APIVAL-CAM-001: the API validation rule type and the camera-only capture mode must
// survive publishing, and forms that use neither must publish exactly as before.

const mockAuthService = { getAccessToken: () => Promise.resolve('t') } as never;
function service(): any {
  return new CrmMetadataService(mockAuthService, new LRUCache({ max: 1, ttl: 1 }) as never);
}

function validationRow(overrides: Record<string, unknown> = {}) {
  return {
    qdb_form_validation_ruleid: 'v1',
    _qdb_form_field_id_value: 'guid-iban',
    qdb_rule_type: 100000014,
    qdb_error_message: 'Enter a valid IBAN',
    qdb_priority: 1,
    ...overrides,
  };
}

const FILE_FIELD = { qdb_form_fieldid: 'guid-photo', qdb_field_type: 100000015, qdb_max_files: 1 };

describe('API validation rule type', () => {
  it('mergeRuleWithTemplate_ApiValidationWithKey_PublishesTypeAndKey', () => {
    const rule = service().mergeRuleWithTemplate(validationRow({
      qdb_rule_json: JSON.stringify({ schemaVersion: 2, type: 'api_validation', key: 'IBAN' }),
    }));

    expect(rule).toMatchObject({ ruleType: 'apiValidation', validationKey: 'IBAN', errorMessage: 'Enter a valid IBAN' });
  });

  it('mergeRuleWithTemplate_ApiValidationWithoutKey_PublishesNoKey', () => {
    const rule = service().mergeRuleWithTemplate(validationRow());

    expect(rule.ruleType).toBe('apiValidation');
    expect(rule).not.toHaveProperty('validationKey');
  });
});

describe('file capture mode', () => {
  it('buildFileUploadConfig_CameraOnly_PublishesCamera', () => {
    const config = service().buildFileUploadConfig({ ...FILE_FIELD, qdb_file_capture_mode: 100000001 });

    expect(config.captureMode).toBe('camera');
  });

  it('buildFileUploadConfig_Any_PublishesNoCaptureMode', () => {
    const config = service().buildFileUploadConfig({ ...FILE_FIELD, qdb_file_capture_mode: 100000000 });

    expect(config).not.toHaveProperty('captureMode');
  });

  it('buildFileUploadConfig_ColumnEmpty_PublishesNoCaptureMode', () => {
    const config = service().buildFileUploadConfig(FILE_FIELD);

    expect(config).not.toHaveProperty('captureMode');
  });
});

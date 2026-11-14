// FR-CSE-072 — survey palette allow-list unit tests.
// RED until SURVEY_ALLOWED_FIELD_TYPES is added to fieldTypes.ts.

import { describe, it, expect } from 'vitest';
import {
  SURVEY_ALLOWED_FIELD_TYPES,
  FIELD_TYPE,
  BASIC_FIELD_TYPES,
  LAYOUT_FIELD_TYPES,
  ADVANCED_FIELD_TYPES,
} from '@/constants/fieldTypes';

describe('SURVEY_ALLOWED_FIELD_TYPES — FR-CSE-072', () => {
  it('includes_all_basic_survey_question_types', () => {
    const surveyQuestionTypes = [
      FIELD_TYPE.TEXT,
      FIELD_TYPE.TEXTAREA,
      FIELD_TYPE.NUMBER,
      FIELD_TYPE.DECIMAL,
      FIELD_TYPE.CURRENCY,
      FIELD_TYPE.DATE,
      FIELD_TYPE.DATETIME,
      FIELD_TYPE.EMAIL,
      FIELD_TYPE.PHONE,
      FIELD_TYPE.DROPDOWN,
      FIELD_TYPE.MULTI_SELECT,
      FIELD_TYPE.CHECKBOX,
      FIELD_TYPE.RADIO,
      FIELD_TYPE.BOOLEAN,
      FIELD_TYPE.INFO_CARD,
      FIELD_TYPE.LABEL,
    ];
    for (const type of surveyQuestionTypes) {
      expect(SURVEY_ALLOWED_FIELD_TYPES.has(type), `Expected survey question type ${type} to be allowed`).toBe(true);
    }
  });

  it('includes_every_layout_type', () => {
    for (const def of LAYOUT_FIELD_TYPES) {
      expect(
        SURVEY_ALLOWED_FIELD_TYPES.has(def.type),
        `Expected layout type ${def.type} to be allowed in surveys`,
      ).toBe(true);
    }
  });

  it('excludes_CRM_lookup_types', () => {
    expect(SURVEY_ALLOWED_FIELD_TYPES.has(FIELD_TYPE.LOOKUP)).toBe(false);
    expect(SURVEY_ALLOWED_FIELD_TYPES.has(FIELD_TYPE.MULTI_LOOKUP)).toBe(false);
  });

  it('excludes_file_upload_and_rich_text', () => {
    expect(SURVEY_ALLOWED_FIELD_TYPES.has(FIELD_TYPE.FILE_UPLOAD)).toBe(false);
    expect(SURVEY_ALLOWED_FIELD_TYPES.has(FIELD_TYPE.RICH_TEXT)).toBe(false);
  });

  it('excludes_all_advanced_types', () => {
    for (const def of ADVANCED_FIELD_TYPES) {
      expect(
        SURVEY_ALLOWED_FIELD_TYPES.has(def.type),
        `Expected advanced type ${def.type} to be excluded from surveys`,
      ).toBe(false);
    }
  });

  it('normal_palette_still_contains_every_basic_type_unchanged — C-6_regression_guard', () => {
    // C-6 / NFR-CSE-010: Normal forms must keep every control.
    const basicValues = BASIC_FIELD_TYPES.map(d => d.type);
    expect(basicValues).toContain(FIELD_TYPE.LOOKUP);
    expect(basicValues).toContain(FIELD_TYPE.FILE_UPLOAD);
    expect(basicValues).toContain(FIELD_TYPE.RICH_TEXT);
    expect(basicValues).toContain(FIELD_TYPE.MULTI_LOOKUP);
  });
});

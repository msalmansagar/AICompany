import { describe, it, expect } from 'vitest';
import {
  TRANSLATABLE_FIELDS,
  ENTITY_LABEL,
} from '@/constants/translatableFields';

// Regression guard for DFE-i18n-001 BLOCKER-001: the designer once keyed grid
// columns under the OData entity-SET name 'qdb_grid_column_configs' (plural),
// while the backend TranslationResolutionService reads the logical entity name
// 'qdb_grid_column_config' (singular). The mismatch made grid-column Arabic
// translations silently fall back to English (FR-011 broken) despite green tests.
describe('TRANSLATABLE_FIELDS canonical entity names', () => {
  it('keys grid columns by the singular logical name, not the OData set name', () => {
    expect(TRANSLATABLE_FIELDS).toHaveProperty('qdb_grid_column_config');
    expect(TRANSLATABLE_FIELDS).not.toHaveProperty('qdb_grid_column_configs');
  });

  it('keys every entity by a singular logical name (no plural set names)', () => {
    for (const entityName of Object.keys(TRANSLATABLE_FIELDS)) {
      expect(entityName.endsWith('configs')).toBe(false);
    }
  });

  it('has a matching ENTITY_LABEL for every translatable entity', () => {
    for (const entityName of Object.keys(TRANSLATABLE_FIELDS)) {
      expect(ENTITY_LABEL[entityName]).toBeDefined();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { CollectionSettingsError, readCollectionSettings, requireSetting } from './collectionSettings.js';

describe('reading Collection settings from the feature-flag bag', () => {
  it('returns nothing when the organisation has set nothing — no defaults', () => {
    expect(readCollectionSettings(undefined)).toEqual({});
    expect(readCollectionSettings({})).toEqual({});
  });

  it('reads the snapshot key composition, the episode policy, the rule-engine operations and the numbering source', () => {
    const settings = readCollectionSettings({
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'sourceTimestamp'],
      episodePolicy: { reopenWindowDays: 30 },
      ruleEngineOperations: { eligibility: 'qdb_dcp_EvaluateEligibility', strategy: 'qdb_dcp_SelectStrategy' },
      caseNumbering: 'Provisional',
      unrelatedFlag: true,
    });
    expect(settings).toEqual({
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'sourceTimestamp'],
      episodePolicy: { reopenWindowDays: 30 },
      ruleEngineOperations: { eligibility: 'qdb_dcp_EvaluateEligibility', strategy: 'qdb_dcp_SelectStrategy' },
      caseNumbering: 'Provisional',
    });
  });

  it('rejects a key part outside the candidate vocabulary rather than ignoring it', () => {
    expect(() => readCollectionSettings({ snapshotKeyComposition: ['facilityNumber', 'mobileNumber'] })).toThrow(CollectionSettingsError);
  });

  it('rejects an empty composition', () => {
    expect(() => readCollectionSettings({ snapshotKeyComposition: [] })).toThrow(CollectionSettingsError);
  });

  it('names the missing setting and where to set it', () => {
    expect(() => requireSetting({}, 'snapshotKeyComposition', 'HL')).toThrow(/snapshotKeyComposition.*qdb_featureflags/);
  });

  it('returns a present setting', () => {
    expect(requireSetting({ caseNumbering: 'Provisional' }, 'caseNumbering', 'HL')).toBe('Provisional');
  });
});

describe('rule-engine operation names (Phase 3)', () => {
  it('rejects an operation bag with an unknown decision', () => {
    expect(() => readCollectionSettings({ ruleEngineOperations: { eligibility: 'op', nonsense: 'x' } }))
      .toThrow(CollectionSettingsError);
  });

  it('rejects a numbering source outside the two supported kinds', () => {
    expect(() => readCollectionSettings({ caseNumbering: 'Sequential' })).toThrow(CollectionSettingsError);
  });

  it('accepts a partially configured operation bag — a deployment may configure one decision at a time', () => {
    expect(readCollectionSettings({ ruleEngineOperations: { eligibility: 'op' } }))
      .toEqual({ ruleEngineOperations: { eligibility: 'op' } });
  });
});

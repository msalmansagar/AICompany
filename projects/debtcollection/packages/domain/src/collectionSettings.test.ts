import { describe, expect, it } from 'vitest';
import { CollectionSettingsError, readCollectionSettings, requireSetting } from './collectionSettings.js';

describe('reading Collection settings from the feature-flag bag', () => {
  it('returns nothing when the organisation has set nothing — no defaults', () => {
    expect(readCollectionSettings(undefined)).toEqual({});
    expect(readCollectionSettings({})).toEqual({});
  });

  it('reads the snapshot key composition, the episode policy and the eligibility operation', () => {
    const settings = readCollectionSettings({
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'sourceTimestamp'],
      episodePolicy: { reopenWindowDays: 30 },
      eligibilityOperation: 'qdb_dcp_EvaluateEligibility',
      unrelatedFlag: true,
    });
    expect(settings).toEqual({
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'sourceTimestamp'],
      episodePolicy: { reopenWindowDays: 30 },
      eligibilityOperation: 'qdb_dcp_EvaluateEligibility',
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
    expect(requireSetting({ eligibilityOperation: 'op' }, 'eligibilityOperation', 'HL')).toBe('op');
  });
});

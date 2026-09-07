import { describe, expect, it } from 'vitest';
import { endpointVersion } from './apiBase';

// On-premises orgs do not serve /api/data/v9.2 — the endpoint version must follow
// the org version (EDP-DSN-002 step 2).

describe('endpointVersion', () => {
  it('should_return_org_major_minor_for_onprem_version', () => {
    expect(endpointVersion('9.0.2.3034')).toBe('9.0');
    expect(endpointVersion('8.2.15.8')).toBe('8.2');
    expect(endpointVersion('9.1.0.643')).toBe('9.1');
  });

  it('should_return_cloud_version_for_cloud_org', () => {
    expect(endpointVersion('9.2.24085.190')).toBe('9.2');
  });

  it('should_fall_back_to_92_when_version_is_missing_or_malformed', () => {
    expect(endpointVersion(undefined)).toBe('9.2');
    expect(endpointVersion(null)).toBe('9.2');
    expect(endpointVersion('')).toBe('9.2');
    expect(endpointVersion('vNext')).toBe('9.2');
  });
});

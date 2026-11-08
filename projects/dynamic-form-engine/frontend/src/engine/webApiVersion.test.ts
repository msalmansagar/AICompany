import { describe, it, expect } from 'vitest';
import { webApiBaseUrlFor, webApiVersionFor } from '@qdb/shared';

// On-prem 9.1 answers /api/data/v9.2 with a 500, so the path must follow the server's own
// version rather than the newest one the cloud happens to accept.
describe('webApiVersionFor', () => {
  it('webApiVersionFor_onPrem91Server_returnsV91', () => {
    expect(webApiVersionFor('9.1.0.643')).toBe('v9.1');
  });

  it('webApiVersionFor_cloudServer_returnsV92', () => {
    expect(webApiVersionFor('9.2.24093.00185')).toBe('v9.2');
  });

  it('webApiVersionFor_onPrem90Server_returnsV90', () => {
    expect(webApiVersionFor('9.0.2.3034')).toBe('v9.0');
  });

  // v9.0 is served by every 9.x server, cloud and on-prem alike.
  it('webApiVersionFor_missingVersion_returnsV90', () => {
    expect(webApiVersionFor(undefined)).toBe('v9.0');
  });

  it('webApiVersionFor_unparseableVersion_returnsV90', () => {
    expect(webApiVersionFor('unknown')).toBe('v9.0');
  });
});

describe('webApiBaseUrlFor', () => {
  it('webApiBaseUrlFor_onPremOrgUrl_keepsTheOrgSegment', () => {
    expect(webApiBaseUrlFor('https://mcdynccatdev01/QDB', '9.1.0.643')).toBe('https://mcdynccatdev01/QDB/api/data/v9.1');
  });

  it('webApiBaseUrlFor_trailingSlash_isNotDoubled', () => {
    expect(webApiBaseUrlFor('https://org.crm4.dynamics.com/', '9.2.1.1')).toBe('https://org.crm4.dynamics.com/api/data/v9.2');
  });
});

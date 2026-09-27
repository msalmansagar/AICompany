/**
 * The OData path is built from the org's configured Web API version, so one build serves
 * Dynamics 365 CE 9.1 on-premises and Dataverse cloud without a code change (Phase 1).
 */
import { describe, it, expect } from 'vitest';
import { buildListUrl, buildSingleUrl, buildActionUrl } from './buildODataUrl.js';

const ON_PREM = { baseUrl: 'https://crm.qdb.internal/HLCRM', apiVersion: '9.1' };
const CLOUD = { baseUrl: 'https://org5869857f.crm4.dynamics.com', apiVersion: '9.2' };

describe('OData path follows the configured platform version', () => {
  it('should_build_an_on_premises_list_url_with_v9_1', () => {
    const url = buildListUrl(ON_PREM.baseUrl, ON_PREM.apiVersion, 'qdb_collectioncases');

    expect(url).toContain('/api/data/v9.1/qdb_collectioncases');
    expect(url).not.toContain('v9.2');
  });

  it('should_build_a_cloud_list_url_with_v9_2', () => {
    const url = buildListUrl(CLOUD.baseUrl, CLOUD.apiVersion, 'qdb_collectioncases');

    expect(url).toContain('/api/data/v9.2/qdb_collectioncases');
    expect(url).not.toContain('v9.1');
  });

  it('should_build_a_single_record_url_for_either_platform', () => {
    const id = '00000000-0000-0000-0000-000000000001';

    expect(buildSingleUrl(ON_PREM.baseUrl, ON_PREM.apiVersion, 'qdb_collectioncases', id))
      .toContain('/api/data/v9.1/');
    expect(buildSingleUrl(CLOUD.baseUrl, CLOUD.apiVersion, 'qdb_collectioncases', id))
      .toContain('/api/data/v9.2/');
  });

  it('should_build_an_action_url_for_either_platform', () => {
    expect(buildActionUrl(ON_PREM.baseUrl, ON_PREM.apiVersion, 'qdb_dcp_EvaluateEligibility'))
      .toBe('https://crm.qdb.internal/HLCRM/api/data/v9.1/qdb_dcp_EvaluateEligibility');
    expect(buildActionUrl(CLOUD.baseUrl, CLOUD.apiVersion, 'qdb_dcp_EvaluateEligibility'))
      .toBe('https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_dcp_EvaluateEligibility');
  });
});

import type { ICrmAdapter } from './ICrmAdapter';
import type { CrmEnvironmentService } from './CrmEnvironmentService';
import { DataverseAdapter } from './DataverseAdapter';
import { ODataAdapter } from './ODataAdapter';

/**
 * Creates the correct CRM adapter based on environment detection.
 * Online environments use Xrm.WebApi; on-prem uses fetch() with credentials.
 */
export function createAdapter(envService: CrmEnvironmentService): ICrmAdapter {
  return envService.isOnline()
    ? new DataverseAdapter(envService)
    : new ODataAdapter(envService);
}

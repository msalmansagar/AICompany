import type { ISopAdapter } from './ISopAdapter';
import type { CrmEnvironmentService } from './CrmEnvironmentService';
import { DataverseAdapter } from './DataverseAdapter';
import { ODataAdapter } from './ODataAdapter';

/**
 * Creates the correct CRM adapter based on environment detection.
 * Online/dev environments use ISopAdapter (full feature set including SOP Designer).
 * On-prem also uses ODataAdapter which now implements ISopAdapter.
 */
export function createAdapter(envService: CrmEnvironmentService): ISopAdapter {
  if (envService.isDevMode) return new ODataAdapter(envService);
  return envService.isOnline()
    ? new DataverseAdapter(envService)
    : new ODataAdapter(envService);
}

'use client';

import { usePortalConfig as usePortalConfigFromContext } from '../contexts/PortalConfigContext';

/**
 * Hook alias that reads the portal config from PortalConfigContext.
 * Exported here so the import path for consumers is stable.
 */
export { usePortalConfig } from '../contexts/PortalConfigContext';

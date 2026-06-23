// src/app/SopAdapterContext.ts
import { createContext } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

/**
 * Provides the ICrmAdapter instance to SOP-feature components.
 * The same adapter instance as CrmAdapterContext — the type guard in
 * useSopAdapter() determines at runtime whether ISopAdapter is available.
 */
export const SopAdapterContext = createContext<ICrmAdapter | null>(null);

// src/hooks/useSopAdapter.ts
import { useContext } from 'react';
import { SopAdapterContext } from '@/app/SopAdapterContext';
import { isSopAdapter } from '@/services/ISopAdapter';

export class FeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}

/**
 * Returns the ISopAdapter for the current environment.
 * Throws FeatureUnavailableError if the current adapter is On-Premise
 * (ODataAdapter does not implement ISopAdapter).
 */
export function useSopAdapter() {
  const adapter = useContext(SopAdapterContext);
  if (!adapter) {
    throw new Error('useSopAdapter must be used within SopAdapterContext.Provider');
  }
  if (!isSopAdapter(adapter)) {
    throw new FeatureUnavailableError(
      'SOP Designer requires Dynamics 365 Online. This feature is not available in On-Premise environments.'
    );
  }
  return adapter;
}

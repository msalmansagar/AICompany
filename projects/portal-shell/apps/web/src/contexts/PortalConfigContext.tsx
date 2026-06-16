'use client';

import React, { createContext, useContext } from 'react';
import type { PortalConfig } from '@portal/types';

const PortalConfigContext = createContext<PortalConfig | null>(null);

interface PortalConfigProviderProps {
  value: PortalConfig;
  children: React.ReactNode;
}

export function PortalConfigProvider({ value, children }: PortalConfigProviderProps) {
  return (
    <PortalConfigContext.Provider value={value}>
      {children}
    </PortalConfigContext.Provider>
  );
}

/**
 * Returns the portal configuration from context.
 * Throws when called outside of PortalConfigProvider.
 */
export function usePortalConfig(): PortalConfig {
  const config = useContext(PortalConfigContext);
  if (!config) {
    throw new Error('usePortalConfig must be used within a PortalConfigProvider');
  }
  return config;
}

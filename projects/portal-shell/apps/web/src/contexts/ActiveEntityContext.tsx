'use client';

import React, { createContext, useContext, useState } from 'react';
import type { LinkedEntity } from '@portal/types';

interface ActiveEntityContextValue {
  activeEntity: LinkedEntity | null;
  setActiveEntity: (entity: LinkedEntity | null) => void;
}

const ActiveEntityContext = createContext<ActiveEntityContextValue | null>(null);

interface ActiveEntityProviderProps {
  initialEntity?: LinkedEntity | null;
  children: React.ReactNode;
}

export function ActiveEntityProvider({ initialEntity = null, children }: ActiveEntityProviderProps) {
  const [activeEntity, setActiveEntity] = useState<LinkedEntity | null>(initialEntity);

  return (
    <ActiveEntityContext.Provider value={{ activeEntity, setActiveEntity }}>
      {children}
    </ActiveEntityContext.Provider>
  );
}

/**
 * Returns the currently selected entity and a setter to change it.
 * Throws when called outside of ActiveEntityProvider.
 */
export function useActiveEntity(): ActiveEntityContextValue {
  const context = useContext(ActiveEntityContext);
  if (!context) {
    throw new Error('useActiveEntity must be used within an ActiveEntityProvider');
  }
  return context;
}

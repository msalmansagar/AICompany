import { createContext, useContext, type ReactNode } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

const CrmAdapterContext = createContext<ICrmAdapter | null>(null);

export function CrmAdapterProvider({
  adapter,
  children,
}: {
  adapter: ICrmAdapter;
  children: ReactNode;
}) {
  return (
    <CrmAdapterContext.Provider value={adapter}>
      {children}
    </CrmAdapterContext.Provider>
  );
}

export function useCrmAdapter(): ICrmAdapter {
  const adapter = useContext(CrmAdapterContext);
  if (!adapter) {
    throw new Error('useCrmAdapter must be used inside CrmAdapterProvider');
  }
  return adapter;
}

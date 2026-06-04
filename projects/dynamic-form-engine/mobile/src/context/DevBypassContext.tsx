import React, { createContext, useContext, useState } from 'react';

interface DevBypassContextValue {
  isDevBypass: boolean;
  enableDevBypass: () => void;
}

const DevBypassContext = createContext<DevBypassContextValue | null>(null);

export function DevBypassProvider({ children }: { children: React.ReactNode }) {
  const [isDevBypass, setIsDevBypass] = useState(false);

  function enableDevBypass(): void {
    setIsDevBypass(true);
  }

  return (
    <DevBypassContext.Provider value={{ isDevBypass, enableDevBypass }}>
      {children}
    </DevBypassContext.Provider>
  );
}

export function useDevBypass(): DevBypassContextValue {
  const context = useContext(DevBypassContext);
  if (!context) throw new Error('useDevBypass must be used within DevBypassProvider');
  return context;
}

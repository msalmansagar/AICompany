import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

// Pixel thresholds match common Fluent UI breakpoint conventions.
const BREAKPOINTS = { mobile: 640, tablet: 1024 } as const;

function resolveBreakpoint(width: number): Breakpoint {
  if (width <= BREAKPOINTS.mobile) return 'mobile';
  if (width <= BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

export const ResponsiveContext = createContext<Breakpoint>('desktop');

interface ResponsiveEngineProps {
  children: ReactNode;
}

// ResponsiveEngine observes the document element width via ResizeObserver.
// Only the breakpoint string propagates — prevents per-pixel re-renders.
export function ResponsiveEngine({ children }: ResponsiveEngineProps) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    resolveBreakpoint(document.documentElement.clientWidth),
  );

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const newBreakpoint = resolveBreakpoint(entry.contentRect.width);

      setBreakpoint((prev) => (prev !== newBreakpoint ? newBreakpoint : prev));
    });

    observer.observe(document.documentElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <ResponsiveContext.Provider value={breakpoint}>
      {children}
    </ResponsiveContext.Provider>
  );
}

export function useBreakpoint(): Breakpoint {
  return useContext(ResponsiveContext);
}

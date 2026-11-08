// AppearanceProvider — the one place the chosen appearance is held and applied.
//
// It does two things at once, because the design system has two halves. It sets
// `data-theme` on the document element, which is what every variable in
// styles/tokens.css keys off; and it builds the matching Fluent Theme, because
// Fluent's own components do not read those variables and would otherwise stay
// light inside a dark app — a white dialog over a dark canvas.
//
// "Appearance" rather than "theme" deliberately: the runtime already has a theme,
// the customer's ThemeDefinition from CRM, and that one owns the form itself.
// This owns the application chrome around it.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FluentProvider, createDarkTheme, createLightTheme, type Theme } from '@fluentui/react-components';
import {
  APPEARANCE_PALETTES,
  buildBrandRamp,
  fluentTokenOverrides,
  isAppearanceName,
  type AppearanceName,
} from '@qdb/shared';

const STORAGE_KEY = 'dfe.designer.appearance';
const DEFAULT_APPEARANCE: AppearanceName = 'light';

interface AppearanceContextValue {
  appearance: AppearanceName;
  setAppearance: (appearance: AppearanceName) => void;
  isDark: boolean;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * The saved appearance, or null when there is none.
 *
 * A CRM web resource can be sandboxed tightly enough that localStorage throws
 * rather than returning null, so a failure here means "nothing saved" rather than
 * an error worth surfacing.
 */
function readStoredAppearance(): AppearanceName | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isAppearanceName(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredAppearance(appearance: AppearanceName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, appearance);
  } catch {
    // An appearance that cannot be remembered is still worth applying this session.
  }
}

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function initialAppearance(): AppearanceName {
  return readStoredAppearance() ?? (prefersDark() ? 'dark' : DEFAULT_APPEARANCE);
}

function buildFluentTheme(appearance: AppearanceName): Theme {
  const palette = APPEARANCE_PALETTES[appearance];
  const ramp = buildBrandRamp(palette.primary);
  // The ramp fills Fluent's ~200 tokens correctly for a light or dark base; the
  // overrides then restate the neutrals in the design system's own terms.
  const base = palette.isDark ? createDarkTheme(ramp) : createLightTheme(ramp);
  return { ...base, ...fluentTokenOverrides(palette) } as Theme;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [appearance, setAppearanceState] = useState<AppearanceName>(initialAppearance);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appearance);
  }, [appearance]);

  const setAppearance = useCallback((next: AppearanceName) => {
    writeStoredAppearance(next);
    setAppearanceState(next);
  }, []);

  const fluentTheme = useMemo(() => buildFluentTheme(appearance), [appearance]);

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, setAppearance, isDark: APPEARANCE_PALETTES[appearance].isDark }),
    [appearance, setAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <FluentProvider theme={fluentTheme} style={{ height: '100%', background: 'transparent' }}>
        {children}
      </FluentProvider>
    </AppearanceContext.Provider>
  );
}

/** The active appearance and a setter that persists it. */
export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside an AppearanceProvider');
  return context;
}

// AppearanceProvider — the chosen appearance for the form runtime's chrome.
//
// The same two halves as the designer's: `data-theme` on the document element for
// the token stylesheet, and a matching Fluent Theme, because Fluent's own dialogs
// and inputs do not read CSS variables and would otherwise stay light inside a
// dark application.
//
// This is NOT the form's theme. A form is themed from the customer's
// ThemeDefinition in CRM by theme/ThemeProvider, and that keeps owning any form
// they have styled. This owns the application around it, and only reaches the
// form itself where no customer theme was ever authored.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FluentProvider, createDarkTheme, createLightTheme, type Theme } from '@fluentui/react-components';
import {
  APPEARANCE_PALETTES,
  buildBrandRamp,
  fluentTokenOverrides,
  isAppearanceName,
  type AppearanceName,
} from '@qdb/shared';

const STORAGE_KEY = 'dfe.runtime.appearance';
const DEFAULT_APPEARANCE: AppearanceName = 'light';

interface AppearanceContextValue {
  appearance: AppearanceName;
  setAppearance: (appearance: AppearanceName) => void;
  isDark: boolean;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * The saved appearance, or null when there is none. A portal in a locked-down
 * browser or an in-CRM web resource can make localStorage throw, which means
 * "nothing saved" rather than an error worth surfacing.
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

/**
 * The active appearance and a setter that persists it.
 *
 * Falls back to the default outside a provider rather than throwing: the form
 * renderer is mounted directly by tests and by the in-CRM host, and a missing
 * appearance is not a reason for a form to fail to render.
 */
export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (context) return context;

  return {
    appearance: DEFAULT_APPEARANCE,
    setAppearance: () => undefined,
    isDark: false,
  };
}

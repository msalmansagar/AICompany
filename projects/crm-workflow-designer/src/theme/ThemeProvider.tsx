import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// The theme is written onto the document element as `data-theme`, which is what
// every token in styles/tokens.css keys off. It lives in a context rather than a
// hook because two consumers need the same value: the shell, which renders the
// picker, and FluentProvider, whose own components have to darken with the rest
// of the app instead of staying light inside a dark one.

export type ThemeName = 'light' | 'dark' | 'glass' | 'vibrant';

/** A theme, as offered in the picker. */
export interface ThemeOption {
  name: ThemeName;
  label: string;
  description: string;
  /** Class on the swatch chip, defined in styles/components.css. */
  swatchClass: string;
  /** Whether Fluent's own components should use their dark palette. */
  isDark: boolean;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { name: 'light',   label: 'Light',   description: 'Fluent — Power Platform',  swatchClass: 'sw-light',   isDark: false },
  { name: 'dark',    label: 'Dark',    description: 'Fluent, dimmed',           swatchClass: 'sw-dark',    isDark: true },
  { name: 'glass',   label: 'Glass',   description: 'Frosted over pastel mesh', swatchClass: 'sw-glass',   isDark: false },
  { name: 'vibrant', label: 'Vibrant', description: 'Bold saturated gradient',  swatchClass: 'sw-vibrant', isDark: false },
];

const STORAGE_KEY = 'processEngine.theme';
const DEFAULT_THEME: ThemeName = 'light';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && THEME_OPTIONS.some((option) => option.name === value);
}

/**
 * Reads the saved theme. A CRM web resource can be sandboxed tightly enough that
 * localStorage throws rather than returning null, so a failure here simply means
 * "no choice saved" rather than an error worth surfacing.
 */
function readStoredTheme(): ThemeName | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeName(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A theme that cannot be remembered is still worth applying for this session.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme() ?? DEFAULT_THEME);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    writeStoredTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      isDark: THEME_OPTIONS.find((option) => option.name === theme)?.isDark ?? false,
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active theme and a setter that persists it. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}

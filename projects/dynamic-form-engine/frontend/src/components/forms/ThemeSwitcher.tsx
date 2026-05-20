import { useCallback } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons';

const STORAGE_KEY = 'dfe:theme-preference';

const useStyles = makeStyles({
  button: {
    minWidth: 'auto',
    padding: tokens.spacingHorizontalS,
  },
});

interface ThemeSwitcherProps {
  isDarkMode: boolean;
  onToggle: (isDark: boolean) => void;
}

function persistThemePreference(isDark: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // localStorage may be unavailable in restricted contexts; silently skip.
  }
}

export function readStoredThemePreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function ThemeSwitcher({ isDarkMode, onToggle }: ThemeSwitcherProps) {
  const styles = useStyles();

  const handleToggle = useCallback(() => {
    const next = !isDarkMode;
    persistThemePreference(next);
    onToggle(next);
  }, [isDarkMode, onToggle]);

  const label = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Button
      appearance="subtle"
      className={styles.button}
      icon={isDarkMode ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
      onClick={handleToggle}
      aria-label={label}
      title={label}
    />
  );
}

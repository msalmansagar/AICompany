// RED — failing until ThemeSwitcher is implemented
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ThemeSwitcher } from './ThemeSwitcher';

function renderSwitcher(isDarkMode: boolean, onToggle = vi.fn()) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ThemeSwitcher isDarkMode={isDarkMode} onToggle={onToggle} />
    </FluentProvider>,
  );
}

describe('ThemeSwitcher', () => {
  it('renders_darkModeToggleButton', () => {
    renderSwitcher(false);

    expect(
      screen.getByRole('button', { name: /switch to dark mode/i }),
    ).toBeTruthy();
  });

  it('renders_lightModeToggleButton_whenInDarkMode', () => {
    renderSwitcher(true);

    expect(
      screen.getByRole('button', { name: /switch to light mode/i }),
    ).toBeTruthy();
  });

  it('calls_onToggle_withTrue_whenSwitchingToDarkMode', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    renderSwitcher(false, onToggle);

    await user.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('calls_onToggle_withFalse_whenSwitchingToLightMode', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    renderSwitcher(true, onToggle);

    await user.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

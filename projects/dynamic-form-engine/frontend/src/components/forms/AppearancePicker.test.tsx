import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearancePicker } from './AppearancePicker';
import { AppearanceProvider } from '../../theme/AppearanceProvider';

function renderPicker(): void {
  render(
    <AppearanceProvider>
      <AppearancePicker />
    </AppearanceProvider>,
  );
}

async function openMenu(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Change appearance' }));
}

describe('AppearancePicker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps_the_menu_closed_until_asked', () => {
    renderPicker();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers_all_four_appearances', async () => {
    renderPicker();

    await openMenu();

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
    for (const label of ['Light', 'Dark', 'Glass', 'Vibrant']) {
      expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument();
    }
  });

  it('marks_the_active_appearance', async () => {
    renderPicker();

    await openMenu();

    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('applies_a_chosen_appearance_and_closes', async () => {
    renderPicker();

    await openMenu();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Glass' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('glass');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('dismisses_on_escape_without_changing_the_appearance', async () => {
    renderPicker();

    await openMenu();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

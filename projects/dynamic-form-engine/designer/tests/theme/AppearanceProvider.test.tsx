// The appearance has to survive a reload, and it has to reach both halves of the
// design system — `data-theme` for the stylesheet and a Fluent Theme for Fluent's
// own components. These cover the choosing and the remembering.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceProvider, useAppearance } from '@/theme/AppearanceProvider';

const STORAGE_KEY = 'dfe.designer.appearance';

function AppearanceProbe(): React.ReactElement {
  const { appearance, setAppearance, isDark } = useAppearance();
  return (
    <div>
      <span data-testid="current">{appearance}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
      <button type="button" onClick={() => setAppearance('vibrant')}>
        go vibrant
      </button>
    </div>
  );
}

function renderProbe(): void {
  render(
    <AppearanceProvider>
      <AppearanceProbe />
    </AppearanceProvider>,
  );
}

/** jsdom has no matchMedia, so each test states what the OS is asking for. */
function stubPrefersDark(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: prefersDark, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

describe('AppearanceProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    stubPrefersDark(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // The blocked-storage test spies on Storage.prototype; without this the spy
    // outlives it and the next test fails inside localStorage rather than on its
    // own assertion.
    vi.restoreAllMocks();
  });

  it('applies_the_appearance_to_the_document_so_the_stylesheet_can_key_off_it', () => {
    renderProbe();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('remembers_a_choice_so_it_survives_a_reload', async () => {
    renderProbe();

    await userEvent.click(screen.getByRole('button', { name: 'go vibrant' }));

    expect(screen.getByTestId('current')).toHaveTextContent('vibrant');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('vibrant');
    expect(document.documentElement.getAttribute('data-theme')).toBe('vibrant');
  });

  it('restores_the_remembered_choice', () => {
    window.localStorage.setItem(STORAGE_KEY, 'glass');

    renderProbe();

    expect(screen.getByTestId('current')).toHaveTextContent('glass');
  });

  it('ignores_a_stored_value_that_is_not_an_appearance', () => {
    window.localStorage.setItem(STORAGE_KEY, 'neon');

    renderProbe();

    expect(screen.getByTestId('current')).toHaveTextContent('light');
  });

  it('follows_the_operating_system_when_nothing_is_remembered', () => {
    stubPrefersDark(true);

    renderProbe();

    expect(screen.getByTestId('current')).toHaveTextContent('dark');
    expect(screen.getByTestId('is-dark')).toHaveTextContent('true');
  });

  it('still_applies_an_appearance_when_storage_is_blocked', async () => {
    // A web resource can be sandboxed tightly enough that localStorage throws.
    // Losing the memory of the choice must not cost the choice itself.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('access denied');
    });

    renderProbe();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'go vibrant' }));
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('vibrant');
  });

  it('reports_only_dark_as_dark_so_glass_and_vibrant_keep_Fluent_light', () => {
    window.localStorage.setItem(STORAGE_KEY, 'glass');

    renderProbe();

    expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
  });
});

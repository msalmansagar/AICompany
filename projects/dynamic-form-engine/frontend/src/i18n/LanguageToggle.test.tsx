/**
 * LanguageToggle.test.tsx — RED → GREEN tests for the language toggle UI.
 *
 * Covers:
 *   - Renders languages from the provided list (FR-025 / AC-022)
 *   - Active language button has aria-pressed="true"
 *   - Clicking a language calls onSelect (FR-015)
 *   - Renders nothing when languages list is empty
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LanguageConfig } from '@qdb/shared';
import { initI18n } from './i18n';
import { LanguageToggle } from './LanguageToggle';

// Initialise i18next once for tests. initI18n is idempotent.
initI18n('en');

// ── test data ──────────────────────────────────────────────────────────────

const LANGUAGES: LanguageConfig[] = [
  { code: 'en', displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1 },
  { code: 'ar', displayName: 'Arabic', isDefault: false, isRtl: true, displayOrder: 2 },
];

// ── tests ──────────────────────────────────────────────────────────────────

describe('LanguageToggle', () => {
  it('should_render_language_buttons_from_config_list', () => {
    // Arrange + Act
    render(
      <LanguageToggle languages={LANGUAGES} activeLanguage="en" onSelect={vi.fn()} />,
    );
    // Assert — buttons rendered for each language (FR-025 / AC-022)
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arabic' })).toBeInTheDocument();
  });

  it('should_mark_active_language_as_pressed', () => {
    // Arrange + Act
    render(
      <LanguageToggle languages={LANGUAGES} activeLanguage="ar" onSelect={vi.fn()} />,
    );
    // Assert — Arabic button has aria-pressed="true"
    const arabicBtn = screen.getByRole('button', { name: 'Arabic' });
    expect(arabicBtn).toHaveAttribute('aria-pressed', 'true');
    // English button should not be pressed
    const englishBtn = screen.getByRole('button', { name: 'English' });
    expect(englishBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('should_call_onSelect_with_correct_code_when_button_clicked', () => {
    // Arrange
    const onSelect = vi.fn();
    render(
      <LanguageToggle languages={LANGUAGES} activeLanguage="en" onSelect={onSelect} />,
    );
    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));
    // Assert
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('ar');
  });

  it('should_render_nothing_when_languages_list_is_empty', () => {
    // Arrange + Act
    const { container } = render(
      <LanguageToggle languages={[]} activeLanguage="en" onSelect={vi.fn()} />,
    );
    // Assert — null render means no DOM output
    expect(container.firstChild).toBeNull();
  });

  it('should_render_nav_with_accessible_label', () => {
    // Arrange + Act
    render(
      <LanguageToggle languages={LANGUAGES} activeLanguage="en" onSelect={vi.fn()} />,
    );
    // Assert
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

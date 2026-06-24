/**
 * useLanguage.test.ts — RED → GREEN tests for the language selection hook.
 *
 * Covers (NFR-011 MODULE 2 boundary):
 *   - URL precedence over localStorage (OQ-002)
 *   - localStorage fallback over default
 *   - English default when no URL or storage (OQ-003)
 *   - setLanguage writes to storage and updates URL
 *   - isRtl / dir derived from LanguageConfig list
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LanguageConfig } from '@qdb/shared';
import { useLanguage } from './useLanguage';

// ── helpers ────────────────────────────────────────────────────────────────

const ENGLISH: LanguageConfig = {
  code: 'en',
  displayName: 'English',
  isDefault: true,
  isRtl: false,
  displayOrder: 1,
};

const ARABIC: LanguageConfig = {
  code: 'ar',
  displayName: 'Arabic',
  isDefault: false,
  isRtl: true,
  displayOrder: 2,
};

const SUPPORTED = [ENGLISH, ARABIC];

function setUrlLang(code: string | null) {
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set('lang', code);
  } else {
    url.searchParams.delete('lang');
  }
  window.history.replaceState(null, '', url.toString());
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('useLanguage', () => {
  beforeEach(() => {
    // Reset URL and localStorage between tests.
    setUrlLang(null);
    localStorage.removeItem('qdb_lang');
    vi.restoreAllMocks();
  });

  it('should_return_english_by_default_when_no_url_param_and_no_storage', () => {
    // Arrange — no URL param, no localStorage
    // Act
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Assert
    expect(result.current.language).toBe('en');
    expect(result.current.isRtl).toBe(false);
    expect(result.current.dir).toBe('ltr');
  });

  it('should_prefer_url_param_over_localStorage_when_both_set', () => {
    // Arrange
    localStorage.setItem('qdb_lang', 'ar');
    setUrlLang('en');
    // Act
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Assert — URL wins (OQ-002)
    expect(result.current.language).toBe('en');
  });

  it('should_use_localStorage_when_no_url_param_is_set', () => {
    // Arrange
    localStorage.setItem('qdb_lang', 'ar');
    setUrlLang(null);
    // Act
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Assert
    expect(result.current.language).toBe('ar');
  });

  it('should_return_isRtl_true_for_arabic_from_config', () => {
    // Arrange
    localStorage.setItem('qdb_lang', 'ar');
    // Act
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Assert
    expect(result.current.isRtl).toBe(true);
    expect(result.current.dir).toBe('rtl');
  });

  it('should_persist_language_to_localStorage_when_setLanguage_called', () => {
    // Arrange
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Act
    act(() => {
      result.current.setLanguage('ar');
    });
    // Assert
    expect(localStorage.getItem('qdb_lang')).toBe('ar');
  });

  it('should_update_url_param_when_setLanguage_called', () => {
    // Arrange
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    // Act
    act(() => {
      result.current.setLanguage('ar');
    });
    // Assert — URL must contain lang=ar
    const params = new URLSearchParams(window.location.search);
    expect(params.get('lang')).toBe('ar');
  });

  it('should_update_language_state_reactively_when_setLanguage_called', () => {
    // Arrange
    const { result } = renderHook(() => useLanguage(SUPPORTED));
    expect(result.current.language).toBe('en');
    // Act
    act(() => {
      result.current.setLanguage('ar');
    });
    // Assert
    expect(result.current.language).toBe('ar');
    expect(result.current.isRtl).toBe(true);
  });

  it('should_default_to_ltr_when_supported_languages_list_is_empty', () => {
    // Arrange — languages not yet loaded
    localStorage.setItem('qdb_lang', 'ar');
    // Act
    const { result } = renderHook(() => useLanguage([]));
    // Assert — code is "ar" but RTL unknown → safe default false
    expect(result.current.language).toBe('ar');
    expect(result.current.isRtl).toBe(false);
    expect(result.current.dir).toBe('ltr');
  });
});

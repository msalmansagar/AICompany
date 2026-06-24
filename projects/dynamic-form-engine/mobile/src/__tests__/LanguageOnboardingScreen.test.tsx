/**
 * LanguageOnboardingScreen unit tests — TDD Red → Green
 *
 * Tests first-launch language selection screen (OQ-005, FR-016, AC-009).
 * Uses RNTL + mocked RtlManager.
 */
import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react-native';

jest.mock('../i18n/RtlManager', () => ({
  applyRtlIfChanged: jest.fn(() => Promise.resolve()),
  initRtlFromStorage: jest.fn(() => Promise.resolve()),
}));

jest.mock('../i18n/useLanguageStore', () => ({
  persistLanguage: jest.fn(() => Promise.resolve()),
  isRtlLanguage: (code: string) => code === 'ar',
}));

import { applyRtlIfChanged } from '../i18n/RtlManager';
import { persistLanguage } from '../i18n/useLanguageStore';
import { LanguageOnboardingScreen } from '../screens/LanguageOnboardingScreen';

const mockApplyRtl = applyRtlIfChanged as jest.MockedFunction<typeof applyRtlIfChanged>;
const mockPersistLanguage = persistLanguage as jest.MockedFunction<typeof persistLanguage>;

describe('LanguageOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_render_language_selection_options', () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    expect(screen.getByTestId('language-option-en')).toBeTruthy();
    expect(screen.getByTestId('language-option-ar')).toBeTruthy();
  });

  it('should_render_continue_button_as_disabled_before_selection', () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    const continueBtn = screen.getByTestId('language-onboarding-continue');
    expect(continueBtn.props.accessibilityState?.disabled).toBeTruthy();
  });

  it('should_render_onboarding_screen_testid', () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    expect(screen.getByTestId('language-onboarding-screen')).toBeTruthy();
  });

  it('should_select_english_and_enable_continue_button', () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('language-option-en'));
    const continueBtn = screen.getByTestId('language-onboarding-continue');
    expect(continueBtn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('should_select_arabic_and_enable_continue_button', () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('language-option-ar'));
    const continueBtn = screen.getByTestId('language-onboarding-continue');
    expect(continueBtn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('should_persist_language_on_continue_with_english', async () => {
    const onComplete = jest.fn();
    render(<LanguageOnboardingScreen onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('language-option-en'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-onboarding-continue'));
    });

    expect(mockPersistLanguage).toHaveBeenCalledWith('en');
  });

  it('should_call_applyRtlIfChanged_with_false_for_english', async () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('language-option-en'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-onboarding-continue'));
    });

    expect(mockApplyRtl).toHaveBeenCalledWith(false);
  });

  it('should_call_applyRtlIfChanged_with_true_for_arabic', async () => {
    render(<LanguageOnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('language-option-ar'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-onboarding-continue'));
    });

    expect(mockApplyRtl).toHaveBeenCalledWith(true);
  });

  it('should_call_onComplete_with_selected_language_after_english_selection', async () => {
    const onComplete = jest.fn();
    render(<LanguageOnboardingScreen onComplete={onComplete} />);
    fireEvent.press(screen.getByTestId('language-option-en'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-onboarding-continue'));
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('en');
    });
  });
});

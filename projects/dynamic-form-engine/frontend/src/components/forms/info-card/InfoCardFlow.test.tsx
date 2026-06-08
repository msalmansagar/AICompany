// RED — failing until InfoCardFlow is implemented correctly.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { InfoCardFlow } from './InfoCardFlow';
import type { FormDefinition, InfoCardScreen } from '@qdb/shared';

// Mock the API client used for first-view audit — fire-and-forget, should not block tests.
vi.mock('../../../api/apiClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { hasViewed: true } }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

function makeScreen(overrides: Partial<InfoCardScreen> = {}): InfoCardScreen {
  return {
    screenId: 'screen-1',
    displayOrder: 1,
    iconUrl: null,
    iconAltText: null,
    heading: 'Welcome',
    subHeading: 'Please read this information.',
    sections: [],
    ...overrides,
  };
}

function makeFormDefinition(
  infoCards: InfoCardScreen[],
  overrides: Partial<FormDefinition> = {},
): FormDefinition {
  return {
    id: 'form-1',
    formCode: 'test-form',
    title: 'Test Form',
    status: 'active',
    version: 1,
    allowSaveDraft: false,
    draftExpiryDays: 7,
    confirmationMessage: 'Thank you',
    allowInfocardSkip: false,
    infocardCountsInProgress: false,
    infoCards,
    submissionMappings: [],
    buttons: [],
    tabs: [],
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderFlow(
  formDefinition: FormDefinition,
  onComplete: () => void = vi.fn(),
) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <InfoCardFlow formDefinition={formDefinition} onComplete={onComplete} />
    </FluentProvider>,
  );
}

describe('InfoCardFlow', () => {
  it('renders_firstScreen_heading_onMount', () => {
    const screens = [makeScreen({ heading: 'Step 1' })];
    const form = makeFormDefinition(screens);

    renderFlow(form);

    expect(screen.getByRole('heading', { name: /step 1/i })).toBeTruthy();
  });

  it('advances_toNextScreen_onContinueClick', () => {
    const screens = [
      makeScreen({ screenId: 'screen-1', displayOrder: 1, heading: 'Screen 1' }),
      makeScreen({ screenId: 'screen-2', displayOrder: 2, heading: 'Screen 2' }),
    ];
    const form = makeFormDefinition(screens);

    renderFlow(form);

    const continueButton = screen.getByRole('button', {
      name: /continue/i,
    });
    fireEvent.click(continueButton);

    expect(screen.getByRole('heading', { name: /screen 2/i })).toBeTruthy();
  });

  it('calls_onComplete_onStartClick_fromLastScreen', () => {
    const onComplete = vi.fn();
    const screens = [makeScreen({ heading: 'Only Screen' })];
    const form = makeFormDefinition(screens);

    renderFlow(form, onComplete);

    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('calls_onComplete_onSkipClick_whenAllowSkipIsTrue', () => {
    const onComplete = vi.fn();
    const screens = [makeScreen({ heading: 'Skippable' })];
    const form = makeFormDefinition(screens, { allowInfocardSkip: true });

    renderFlow(form, onComplete);

    const skipButton = screen.getByRole('button', { name: /skip/i });
    fireEvent.click(skipButton);

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('does_not_show_skip_link_whenAllowSkipIsFalse', () => {
    const screens = [makeScreen()];
    const form = makeFormDefinition(screens, { allowInfocardSkip: false });

    renderFlow(form);

    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
  });

  it('does_not_show_back_button_onFirstScreen', () => {
    const screens = [makeScreen(), makeScreen({ screenId: 's2', displayOrder: 2 })];
    const form = makeFormDefinition(screens);

    renderFlow(form);

    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
  });

  it('shows_back_button_afterNavigatingToSecondScreen', () => {
    const screens = [
      makeScreen({ screenId: 's1', displayOrder: 1, heading: 'First' }),
      makeScreen({ screenId: 's2', displayOrder: 2, heading: 'Second' }),
    ];
    const form = makeFormDefinition(screens);

    renderFlow(form);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
  });

  it('goes_backToFirstScreen_onBackClick', () => {
    const screens = [
      makeScreen({ screenId: 's1', displayOrder: 1, heading: 'First' }),
      makeScreen({ screenId: 's2', displayOrder: 2, heading: 'Second' }),
    ];
    const form = makeFormDefinition(screens);

    renderFlow(form);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(screen.getByRole('heading', { name: /first/i })).toBeTruthy();
  });
});

// RED — failing: InfoCardFlow navigates screens and calls onComplete
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { InfoCardFlow } from '../components/info-card/InfoCardFlow';
import type { FormDefinition, InfoCardScreen } from '@qdb/shared';

jest.mock('../services/apiClient', () => ({
  apiPost: jest.fn().mockResolvedValue(undefined),
}));

function buildScreen(overrides: Partial<InfoCardScreen> = {}): InfoCardScreen {
  return {
    screenId: `screen-${Math.random()}`,
    displayOrder: 1,
    heading: 'Welcome',
    sections: [],
    ...overrides,
  };
}

function buildForm(screens: InfoCardScreen[]): FormDefinition {
  return {
    formId: 'form-1',
    formCode: 'TEST',
    displayName: 'Test Form',
    description: '',
    version: 1,
    allowSaveDraft: false,
    confirmationMessage: '',
    tabs: [],
    buttons: [],
    businessRules: [],
    submissionMappings: [],
    infoCards: screens,
    allowInfocardSkip: true,
  };
}

describe('InfoCardFlow', () => {
  it('renders_first_screen_heading', () => {
    const form = buildForm([buildScreen({ displayOrder: 1, heading: 'Intro Screen' })]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    expect(screen.getByText('Intro Screen')).toBeTruthy();
  });

  it('navigates_to_next_screen_on_Continue', () => {
    const form = buildForm([
      buildScreen({ displayOrder: 1, heading: 'Screen One' }),
      buildScreen({ displayOrder: 2, heading: 'Screen Two' }),
    ]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    expect(screen.getByText('Screen One')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(screen.getByText('Screen Two')).toBeTruthy();
  });

  it('calls_onComplete_when_Start_pressed_on_last_screen', async () => {
    const onComplete = jest.fn();
    const form = buildForm([buildScreen({ displayOrder: 1, heading: 'Only Screen' })]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={onComplete} />);
    fireEvent.press(screen.getByLabelText('Start'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('calls_onComplete_when_Skip_pressed', async () => {
    const onComplete = jest.fn();
    const form = buildForm([
      buildScreen({ displayOrder: 1, heading: 'Screen One' }),
      buildScreen({ displayOrder: 2, heading: 'Screen Two' }),
    ]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={onComplete} />);
    fireEvent.press(screen.getByLabelText('Skip'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('hides_Back_button_on_first_screen', () => {
    const form = buildForm([buildScreen({ displayOrder: 1, heading: 'First' })]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it('shows_Back_button_after_navigating_forward', () => {
    const form = buildForm([
      buildScreen({ displayOrder: 1, heading: 'A' }),
      buildScreen({ displayOrder: 2, heading: 'B' }),
    ]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('navigates_back_when_Back_pressed', () => {
    const form = buildForm([
      buildScreen({ displayOrder: 1, heading: 'First Screen' }),
      buildScreen({ displayOrder: 2, heading: 'Second Screen' }),
    ]);
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(screen.getByText('Second Screen')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('First Screen')).toBeTruthy();
  });

  it('uses_custom_infocardStartLabel', () => {
    const form: FormDefinition = {
      ...buildForm([buildScreen({ displayOrder: 1, heading: 'Screen' })]),
      infocardStartLabel: 'Begin Now',
    };
    render(<InfoCardFlow formDefinition={form} accessToken="tok" onComplete={jest.fn()} />);
    expect(screen.getByLabelText('Begin Now')).toBeTruthy();
  });
});

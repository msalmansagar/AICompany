// RED — failing: InfoCardNavBar renders and handles button actions
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { InfoCardNavBar } from '../components/info-card/InfoCardNavBar';

const DEFAULT_PROPS = {
  isFirstScreen: false,
  isLastScreen: false,
  allowSkip: true,
  backLabel: 'Back',
  continueLabel: 'Continue',
  startLabel: 'Start',
  skipLabel: 'Skip',
  onBack: jest.fn(),
  onContinue: jest.fn(),
  onSkip: jest.fn(),
};

describe('InfoCardNavBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders_Continue_button_when_not_last_screen', () => {
    render(<InfoCardNavBar {...DEFAULT_PROPS} isLastScreen={false} />);
    expect(screen.getByLabelText('Continue')).toBeTruthy();
  });

  it('renders_Start_button_when_on_last_screen', () => {
    render(<InfoCardNavBar {...DEFAULT_PROPS} isLastScreen />);
    expect(screen.getByLabelText('Start')).toBeTruthy();
  });

  it('hides_Back_button_on_first_screen', () => {
    render(<InfoCardNavBar {...DEFAULT_PROPS} isFirstScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it('shows_Back_button_on_non_first_screen', () => {
    render(<InfoCardNavBar {...DEFAULT_PROPS} isFirstScreen={false} />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('hides_Skip_when_allowSkip_is_false', () => {
    render(<InfoCardNavBar {...DEFAULT_PROPS} allowSkip={false} />);
    expect(screen.queryByLabelText('Skip')).toBeNull();
  });

  it('calls_onBack_when_Back_pressed', () => {
    const onBack = jest.fn();
    render(<InfoCardNavBar {...DEFAULT_PROPS} onBack={onBack} />);
    fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls_onContinue_when_Continue_pressed', () => {
    const onContinue = jest.fn();
    render(<InfoCardNavBar {...DEFAULT_PROPS} onContinue={onContinue} isLastScreen={false} />);
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls_onContinue_when_Start_pressed_on_last_screen', () => {
    const onContinue = jest.fn();
    render(<InfoCardNavBar {...DEFAULT_PROPS} onContinue={onContinue} isLastScreen />);
    fireEvent.press(screen.getByLabelText('Start'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls_onSkip_when_Skip_pressed', () => {
    const onSkip = jest.fn();
    render(<InfoCardNavBar {...DEFAULT_PROPS} onSkip={onSkip} />);
    fireEvent.press(screen.getByLabelText('Skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('uses_custom_labels_from_props', () => {
    render(
      <InfoCardNavBar
        {...DEFAULT_PROPS}
        backLabel="Prev"
        continueLabel="Next"
        skipLabel="Jump"
      />,
    );
    expect(screen.getByLabelText('Prev')).toBeTruthy();
    expect(screen.getByLabelText('Next')).toBeTruthy();
    expect(screen.getByLabelText('Jump')).toBeTruthy();
  });
});

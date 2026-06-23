// RED — failing tests written before implementation verification
// These tests verify the Button component API and rendering behaviour.

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Button } from '../../src/components/ui/Button';

describe('Button', () => {
  describe('render', () => {
    it('renders_primaryVariant_displaysTitle', () => {
      render(<Button title="Submit" onPress={() => undefined} />);
      expect(screen.getByText('Submit')).toBeTruthy();
    });

    it('renders_secondaryVariant_displaysTitle', () => {
      render(<Button title="Cancel" onPress={() => undefined} variant="secondary" />);
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders_loadingState_showsActivityIndicator', () => {
      render(<Button title="Save" onPress={() => undefined} isLoading />);
      // Title should not be visible when loading
      expect(screen.queryByText('Save')).toBeNull();
      expect(screen.getByRole('progressbar')).toBeTruthy();
    });

    it('renders_disabledState_buttonIsDisabled', () => {
      render(<Button title="Disabled" onPress={() => undefined} disabled />);
      const button = screen.getByRole('button');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('interaction', () => {
    it('onPress_enabled_firesCallback', () => {
      const onPress = jest.fn();
      render(<Button title="Click me" onPress={onPress} />);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('onPress_disabled_doesNotFireCallback', () => {
      const onPress = jest.fn();
      render(<Button title="Disabled" onPress={onPress} disabled />);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('onPress_loading_doesNotFireCallback', () => {
      const onPress = jest.fn();
      render(<Button title="Loading" onPress={onPress} isLoading />);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('renders_customAccessibilityLabel_usedInsteadOfTitle', () => {
      render(
        <Button
          title="Submit Form"
          onPress={() => undefined}
          accessibilityLabel="Submit the registration form"
        />,
      );
      const button = screen.getByRole('button', { name: 'Submit the registration form' });
      expect(button).toBeTruthy();
    });

    it('renders_busyState_whenLoading', () => {
      render(<Button title="Saving" onPress={() => undefined} isLoading />);
      const button = screen.getByRole('button');
      expect(button.props.accessibilityState.busy).toBe(true);
    });
  });
});

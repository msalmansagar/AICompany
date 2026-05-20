// RED — failing until ProgressIndicator is implemented
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ProgressIndicator } from './ProgressIndicator';

function renderIndicator(
  currentStep: number,
  totalSteps: number,
  stepLabels: string[],
) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ProgressIndicator
        currentStep={currentStep}
        totalSteps={totalSteps}
        stepLabels={stepLabels}
      />
    </FluentProvider>,
  );
}

describe('ProgressIndicator', () => {
  it('renders_stepCounterText', () => {
    renderIndicator(0, 3, ['Personal Info', 'Documents', 'Review']);

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('renders_activeStepLabel', () => {
    renderIndicator(1, 3, ['Personal Info', 'Documents', 'Review']);

    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('renders_progressBar_withCorrectAriaLabel', () => {
    renderIndicator(1, 3, ['Personal Info', 'Documents', 'Review']);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeTruthy();
    expect(progressBar.getAttribute('aria-valuenow')).toBe('2');
    expect(progressBar.getAttribute('aria-valuemax')).toBe('3');
  });

  it('renders_allStepChips', () => {
    renderIndicator(0, 3, ['Personal Info', 'Documents', 'Review']);

    const list = screen.getByRole('list');
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(3);
  });

  it('marks_activeStep_withAriaCurrent', () => {
    renderIndicator(1, 3, ['Personal Info', 'Documents', 'Review']);

    const stepItems = screen.getAllByRole('listitem');
    const activeItem = stepItems.find(
      (el) => el.getAttribute('aria-current') === 'step',
    );
    expect(activeItem).toBeTruthy();
    expect(activeItem?.textContent).toContain('Documents');
  });
});

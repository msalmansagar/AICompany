// A survey invitation is answered once (CSE-ENG-001): its confirmation must not offer
// "Submit another", which every other form keeps.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FormConfirmation } from './FormConfirmation';

function renderConfirmation(props: Partial<React.ComponentProps<typeof FormConfirmation>> = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FormConfirmation confirmationMessage="Thank you" referenceNumber="REF-1" {...props} />
    </FluentProvider>
  );
}

describe('FormConfirmation', () => {
  it('should_offer_submit_another_for_a_normal_form', () => {
    renderConfirmation();

    expect(screen.getByRole('button', { name: 'Submit another' })).toBeInTheDocument();
  });

  it('should_not_offer_submit_another_for_a_single_submission', () => {
    renderConfirmation({ isSingleSubmission: true });

    expect(screen.queryByRole('button', { name: 'Submit another' })).not.toBeInTheDocument();
  });

  it('should_still_show_the_reference_number_for_a_single_submission', () => {
    renderConfirmation({ isSingleSubmission: true });

    expect(screen.getByText('REF-1')).toBeInTheDocument();
  });
});

import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../components/forms.js';

function Opener() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Log action</button>
      {isOpen && (
        <Dialog title="Log a collection action" onClose={() => setOpen(false)} testId="pane" footer={null}>
          <label>Subject<input aria-label="Subject" /></label>
        </Dialog>
      )}
    </>
  );
}

describe('an action pane takes and returns the keyboard (acceptance A11Y-1)', () => {
  it('Dialog_Opened_FocusesTheFirstField', async () => {
    render(<Opener />);

    await userEvent.click(screen.getByRole('button', { name: 'Log action' }));

    expect(screen.getByLabelText('Subject')).toHaveFocus();
  });

  it('Dialog_EscapePressed_ClosesThePane', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Log action' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Dialog_Closed_ReturnsFocusToTheOpener', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Log action' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Log action' })).toHaveFocus();
  });
});

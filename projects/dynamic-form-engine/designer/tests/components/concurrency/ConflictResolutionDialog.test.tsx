import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ConflictResolutionDialog } from '@/components/concurrency/ConflictResolutionDialog';

const CONFLICT_TIMESTAMP = new Date('2026-07-10T12:00:00Z');

interface RenderOptions {
  isOpen?: boolean;
  onReload?: () => void;
  onDismiss?: () => void;
}

function renderDialog({ isOpen = true, onReload = vi.fn(), onDismiss = vi.fn() }: RenderOptions = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ConflictResolutionDialog
        isOpen={isOpen}
        formId="form-abc"
        localEtag='W/"3"'
        conflictTimestamp={CONFLICT_TIMESTAMP}
        onReload={onReload}
        onDismiss={onDismiss}
      />
    </FluentProvider>
  );
}

describe('ConflictResolutionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders_conflictMessage_whenOpen', () => {
    renderDialog();
    expect(
      screen.getByText(/your changes could not be saved/i)
    ).toBeInTheDocument();
  });

  it('callsOnReload_whenReloadButtonClicked', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();

    renderDialog({ onReload });
    await user.click(screen.getByRole('button', { name: /reload the form/i }));

    expect(onReload).toHaveBeenCalledOnce();
  });

  it('showsDiffViewer_whenReviewButtonClicked', async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByRole('button', { name: /review what changed/i }));

    // FormDiffViewer stub renders a region with aria-label
    expect(screen.getByRole('region', { name: /form diff viewer/i })).toBeInTheDocument();
  });

  it('callsOnDismiss_whenCancelClicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    renderDialog({ onDismiss });
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('doesNotRender_whenNotOpen', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByText(/your changes could not be saved/i)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { axe } from 'vitest-axe';
import { ConflictResolutionDialog } from '@/components/concurrency/ConflictResolutionDialog';
import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

const CONFLICT_TIMESTAMP = new Date('2026-07-10T12:00:00Z');

function makeForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'form-abc',
    name: 'Loan Application',
    code: 'LOAN',
    description: '',
    entityLogicalName: '',
    status: 'draft',
    currentVersion: '1',
    themeId: null,
    allowSaveDraft: true,
    draftExpiryDays: null,
    showSummaryStep: false,
    summaryMode: null,
    showProgressBar: false,
    powerAutomateFlowId: null,
    confirmationMessage: null,
    confirmationRecordRefAttribute: null,
    accessGroupId: null,
    createdBy: '',
    createdOn: new Date(),
    modifiedBy: '',
    modifiedOn: new Date(),
    ...overrides,
  };
}

interface RenderOptions {
  isOpen?: boolean;
  localSnapshot?: DesignerFormModel;
  fetchServerVersion?: () => Promise<DesignerFormModel>;
  onReload?: () => void;
  onDismiss?: () => void;
}

function renderDialog({
  isOpen = true,
  localSnapshot = makeForm(),
  fetchServerVersion = vi.fn().mockResolvedValue(makeForm({ name: 'Loan Application v2' })),
  onReload = vi.fn(),
  onDismiss = vi.fn(),
}: RenderOptions = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ConflictResolutionDialog
        isOpen={isOpen}
        localSnapshot={localSnapshot}
        conflictTimestamp={CONFLICT_TIMESTAMP}
        fetchServerVersion={fetchServerVersion}
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
    const serverForm = makeForm({ name: 'Loan Application v2' });
    const fetchServerVersion = vi.fn().mockResolvedValue(serverForm);
    const user = userEvent.setup();

    renderDialog({ fetchServerVersion });
    await user.click(screen.getByRole('button', { name: /review what changed/i }));

    // Wait for the async fetch to complete and the diff viewer to appear
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /form diff viewer/i })).toBeInTheDocument()
    );
    expect(fetchServerVersion).toHaveBeenCalledOnce();
  });

  it('showsDiffSummary_whenReviewButtonClicked', async () => {
    const serverForm = makeForm({ name: 'Changed Name' });
    const user = userEvent.setup();

    renderDialog({ fetchServerVersion: vi.fn().mockResolvedValue(serverForm) });
    await user.click(screen.getByRole('button', { name: /review what changed/i }));

    // Both the dialog summary span and the FormDiffViewer stub render summarizeDiff text,
    // so we assert at least one matching element is present.
    await waitFor(() =>
      expect(screen.getAllByText(/form name changed from/i).length).toBeGreaterThan(0)
    );
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

  it('hasNoAxeViolations_whenOpen', async () => {
    const { container } = renderDialog();
    // Let Fluent UI settle before running axe
    await waitFor(() =>
      expect(screen.getByText(/your changes could not be saved/i)).toBeInTheDocument()
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

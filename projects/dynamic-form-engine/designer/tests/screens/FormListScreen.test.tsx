// The form list follows the model-driven pattern: a row is selected and acted on
// from the command bar, rather than every row carrying its own buttons. Which
// commands apply is therefore a property of the selection, and that is the logic
// worth holding — the screen had no test at all when the actions were in the rows,
// so removing them broke nothing and proved nothing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CrmContext } from '@/app/App';

const mockNavigateTo = vi.fn();

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn(() => ({ navigateTo: mockNavigateTo, loadForm: vi.fn() })),
  DEFAULT_DESIGN_PAYLOAD: { theme: {}, formDesign: {} },
}));

const FORMS = [
  {
    id: 'form-draft',
    name: 'Draft Form',
    code: 'draft-form',
    status: 'draft',
    currentVersion: '1',
    modifiedOn: new Date('2026-08-01T00:00:00Z'),
  },
  {
    id: 'form-published',
    name: 'Published Form',
    code: 'published-form',
    status: 'published',
    currentVersion: '1',
    modifiedOn: new Date('2026-08-02T00:00:00Z'),
  },
];

const listForms = vi.fn().mockResolvedValue(FORMS);

vi.mock('@/services/FormDefinitionService', () => ({
  FormDefinitionService: vi.fn(() => ({ listForms })),
}));

import { FormListScreen } from '@/screens/FormListScreen';

const crmService = {
  getWebApi: () => ({}),
  getUserContext: () => ({ userId: 'u', userName: 'u', userFullName: 'U' }),
} as never;

async function renderList(): Promise<void> {
  render(
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={crmService}>
        <FormListScreen />
      </CrmContext.Provider>
    </FluentProvider>,
  );
  await waitFor(() => expect(screen.getByText('Draft Form')).toBeInTheDocument());
}

const command = (name: RegExp): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

// Single selection renders a radio, not a checkbox — which is also why the label
// belongs on radioIndicator rather than checkboxIndicator.
async function selectRow(formName: string): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: `Select ${formName}` }));
}

describe('FormListScreen command bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listForms.mockResolvedValue(FORMS);
  });

  afterEach(cleanup);

  it('puts_the_row_actions_on_the_command_bar_not_in_the_rows', async () => {
    await renderList();

    for (const label of [/^Open$/, /^Clone$/, /^Delete$/, /New Form/, /Refresh/]) {
      expect(command(label)).toBeInTheDocument();
    }
    // Nothing per-row survives: the old grid carried "Open <name>" buttons in a
    // trailing Actions column.
    expect(screen.queryByRole('button', { name: 'Clone Draft Form' })).not.toBeInTheDocument();
  });

  it('disables_the_selection_commands_until_a_row_is_chosen', async () => {
    await renderList();

    expect(command(/^Open$/).disabled).toBe(true);
    expect(command(/^Clone$/).disabled).toBe(true);
    expect(command(/^Delete$/).disabled).toBe(true);
  });

  it('says_why_a_command_is_off_rather_than_just_being_dead', async () => {
    await renderList();

    expect(command(/^Open$/)).toHaveAttribute('title', 'Select a form first');
  });

  it('enables_open_and_clone_once_a_row_is_selected', async () => {
    await renderList();

    await selectRow('Published Form');

    expect(command(/^Open$/).disabled).toBe(false);
    expect(command(/^Clone$/).disabled).toBe(false);
  });

  it('offers_delete_only_for_a_draft', async () => {
    await renderList();

    await selectRow('Published Form');

    expect(command(/^Delete$/).disabled).toBe(true);
    expect(command(/^Delete$/)).toHaveAttribute('title', 'Only a draft can be deleted');
  });

  it('enables_delete_for_a_draft', async () => {
    await renderList();

    await selectRow('Draft Form');

    expect(command(/^Delete$/).disabled).toBe(false);
  });

  it('keeps_the_name_as_the_way_into_a_form', async () => {
    await renderList();

    expect(screen.getByRole('button', { name: 'Open Draft Form' })).toHaveClass('link-cell');
  });

  it('always_allows_creating_a_form_with_nothing_selected', async () => {
    await renderList();

    expect(command(/New Form/).disabled).toBe(false);
    await userEvent.click(command(/New Form/));

    expect(mockNavigateTo).toHaveBeenCalledWith('new-form-wizard');
  });
});

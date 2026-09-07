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

// The reference's grid selects with a checkbox, not a radio.
async function selectRow(formName: string): Promise<void> {
  await userEvent.click(screen.getByRole('checkbox', { name: `Select ${formName}` }));
}

const rowFor = (formName: string): HTMLTableRowElement => {
  const row = screen.getByText(formName).closest('tr');
  if (!row) throw new Error(`No row for ${formName}`);
  return row as HTMLTableRowElement;
};

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

  it('selects_with_a_checkbox_as_the_reference_does', async () => {
    await renderList();

    expect(screen.getAllByRole('checkbox')).toHaveLength(FORMS.length);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('selects_from_anywhere_in_the_row', async () => {
    await renderList();

    await userEvent.click(rowFor('Published Form'));

    expect(rowFor('Published Form')).toHaveClass('selected');
    expect(command(/^Open$/).disabled).toBe(false);
  });

  it('opens_rather_than_selects_when_the_name_is_clicked', async () => {
    // The name is a link into the record, not a way of ticking the row. If the row
    // handler did not ignore it, clicking a name would quietly select instead.
    await renderList();

    await userEvent.click(screen.getByRole('button', { name: 'Open Published Form' }));

    expect(command(/^Open$/).disabled).toBe(true);
  });

  it('unselects_when_the_checkbox_is_clicked_again', async () => {
    await renderList();

    await selectRow('Draft Form');
    await selectRow('Draft Form');

    expect(command(/^Open$/).disabled).toBe(true);
  });

  it('sorts_a_column_and_reverses_it_on_a_second_click', async () => {
    await renderList();
    const header = screen.getByRole('columnheader', { name: /Form Name/ });

    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Draft Form');

    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Published Form');
  });

  it('counts_the_statuses_under_the_grid', async () => {
    await renderList();

    const legend = document.querySelector('.legend');
    expect(legend).toHaveTextContent('1 published');
    expect(legend).toHaveTextContent('1 draft');
  });

  it('always_allows_creating_a_form_with_nothing_selected', async () => {
    await renderList();

    expect(command(/New Form/).disabled).toBe(false);
    await userEvent.click(command(/New Form/));

    expect(mockNavigateTo).toHaveBeenCalledWith('new-form-wizard');
  });
});

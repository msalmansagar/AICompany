import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TranslationExchangeDialog } from '@/designer/translations/TranslationExchangeDialog';
import { CrmContext } from '@/app/App';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FakeWebApi } from '../services/translations/fakeWebApi';

const FORM_ID = '11111111-1111-1111-1111-111111111111';
const TAB_ID = '22222222-2222-2222-2222-222222222222';
const LOADS_EXCELJS = { timeout: 20000 };

function org(): FakeWebApi {
  return new FakeWebApi({
    qdb_form_definition: [
      { qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application', qdb_form_code: 'loan' },
    ],
    qdb_form_tab: [{ qdb_form_tabid: TAB_ID, qdb_label: 'Applicant', qdb_schema_name: 'tab_1' }],
    [ENTITY_NAMES.LANGUAGE_CONFIG]: [
      { qdb_language_code: 'en', qdb_is_default: true, qdb_rtl_direction: false },
      { qdb_language_code: 'ar', qdb_is_default: false, qdb_rtl_direction: true },
    ],
    [ENTITY_NAMES.TRANSLATION]: [],
  });
}

function renderDialog(webApi: FakeWebApi = org()) {
  const crm = { getWebApi: () => webApi } as never;
  return render(
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={crm}>
        <TranslationExchangeDialog
          isOpen
          formId={FORM_ID}
          formCode="loan"
          onClose={() => undefined}
        />
      </CrmContext.Provider>
    </FluentProvider>,
  );
}

describe('TranslationExchangeDialog', () => {
  // jsdom does not implement object URLs, so they are patched on rather than replaced —
  // swapping the whole URL global would break `new URL(...)` everywhere else.
  const originals = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:workbook');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originals.create;
    URL.revokeObjectURL = originals.revoke;
    vi.restoreAllMocks();
  });

  it('dialog_offersBothHalvesOfTheRoundTrip', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /download workbook/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy();
  });

  it('download_reportsHowManyStringsWentIntoTheWorkbook', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /download workbook/i }));

    // The count and its label are separate text nodes, so this reads the rendered text.
    // Generous timeout: the dialog loads exceljs on demand, which is a megabyte of chunk.
    await waitFor(() => expect(document.body.textContent).toContain('2 string(s)'), LOADS_EXCELJS);
  });

  it('download_namesTheTargetLanguages', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /download workbook/i }));

    await waitFor(() => expect(screen.getByText(/language\(s\): ar/)).toBeTruthy(), LOADS_EXCELJS);
  });

  it('download_handsTheFileToTheBrowser', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /download workbook/i }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled(), LOADS_EXCELJS);
  });

  it('download_warnsWhenATableCouldNotBeRead_soAShortWorkbookIsNotMistakenForComplete', async () => {
    const api = new FakeWebApi(
      {
        qdb_form_definition: [{ qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application' }],
        [ENTITY_NAMES.LANGUAGE_CONFIG]: [
          { qdb_language_code: 'en', qdb_is_default: true },
          { qdb_language_code: 'ar', qdb_is_default: false },
        ],
        [ENTITY_NAMES.TRANSLATION]: [],
      },
      { qdb_info_card_screen: new Error('Resource not found for the segment') },
    );
    renderDialog(api);

    await userEvent.click(screen.getByRole('button', { name: /download workbook/i }));

    await waitFor(() => expect(screen.getByText(/could not be read/)).toBeTruthy(), LOADS_EXCELJS);
  });

  it('download_showsTheFailure_whenTheLanguageConfigCannotBeRead', async () => {
    const api = new FakeWebApi(
      { qdb_form_definition: [{ qdb_form_definitionid: FORM_ID, qdb_title: 'Loan' }] },
      { [ENTITY_NAMES.LANGUAGE_CONFIG]: new Error('403 Forbidden') },
    );
    renderDialog(api);

    await userEvent.click(screen.getByRole('button', { name: /download workbook/i }));

    await waitFor(() => expect(screen.getByText(/403 Forbidden/)).toBeTruthy(), LOADS_EXCELJS);
  });
});

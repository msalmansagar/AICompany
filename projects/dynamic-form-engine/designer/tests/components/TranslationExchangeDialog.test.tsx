import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import ExcelJS from 'exceljs';
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

function renderDialog(webApi: FakeWebApi = org(), onPublish: () => void = () => undefined) {
  const crm = { getWebApi: () => webApi } as never;
  return render(
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={crm}>
        <TranslationExchangeDialog
          isOpen
          formId={FORM_ID}
          formCode="loan"
          onClose={() => undefined}
          onPublish={onPublish}
        />
      </CrmContext.Provider>
    </FluentProvider>,
  );
}

const HEADER = ['Entity', 'Record Id', 'Field', 'Where', 'Source (en)', 'Source changed?', 'ar'];

/** Builds a workbook in the shape the export produces and feeds it to the hidden file input. */
async function uploadWorkbook(rows: unknown[][]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Translations');
  sheet.addRow(HEADER);
  for (const row of rows) sheet.addRow(row);
  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

  const file = new File([buffer], 'filled.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  // jsdom's File has no arrayBuffer() in this environment.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer });

  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not rendered');
  await userEvent.upload(input, file);
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

  it('check_saysNoChangesPlainly_whenTheFileMatchesCrm', async () => {
    const api = new FakeWebApi({
      qdb_form_definition: [
        { qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application', qdb_form_code: 'loan' },
      ],
      [ENTITY_NAMES.LANGUAGE_CONFIG]: [
        { qdb_language_code: 'en', qdb_is_default: true },
        { qdb_language_code: 'ar', qdb_is_default: false },
      ],
      [ENTITY_NAMES.TRANSLATION]: [
        {
          qdb_translationid: 'tr-1',
          qdb_entity_name: 'qdb_form_definition',
          qdb_record_id: FORM_ID,
          qdb_field_name: 'qdb_title',
          qdb_language_code: 'ar',
          qdb_translated_value: 'طلب قرض',
          qdb_source_value: 'Loan Application',
        },
      ],
    });
    renderDialog(api);

    await uploadWorkbook([
      ['qdb_form_definition', FORM_ID, 'qdb_title', '', 'Loan Application', '', 'طلب قرض'],
    ]);

    // The button only renders once the workbook has been parsed, which loads exceljs.
    const check = await screen.findByRole(
      'button',
      { name: /check without saving/i },
      LOADS_EXCELJS,
    );
    await userEvent.click(check);

    await waitFor(
      () => expect(document.body.textContent).toContain('No changes'),
      LOADS_EXCELJS,
    );
  });

  it('upload_reportsHowManyCellsAreFilledIn_soAMissedEditIsVisible', async () => {
    renderDialog();

    await uploadWorkbook([
      ['qdb_form_definition', FORM_ID, 'qdb_title', '', 'Loan Application', '', 'طلب قرض'],
      ['qdb_form_tab', TAB_ID, 'qdb_label', '', 'Applicant', '', ''],
    ]);

    await waitFor(
      () => expect(document.body.textContent).toContain('1 cell(s) filled in'),
      LOADS_EXCELJS,
    );
  });

  it('apply_offersPublish_becauseTheRuntimeStillServesTheOldJson', async () => {
    const onPublish = vi.fn();
    renderDialog(org(), onPublish);

    await uploadWorkbook([
      ['qdb_form_definition', FORM_ID, 'qdb_title', '', 'Loan Application', '', 'طلب قرض'],
    ]);
    const check = await screen.findByRole('button', { name: /check without saving/i }, LOADS_EXCELJS);
    await userEvent.click(check);
    await userEvent.click(await screen.findByRole('button', { name: /^apply$/i }, LOADS_EXCELJS));

    const publish = await screen.findByRole('button', { name: /publish now/i }, LOADS_EXCELJS);
    await userEvent.click(publish);

    expect(onPublish).toHaveBeenCalled();
  });

  it('apply_doesNotOfferPublish_whenNothingChanged', async () => {
    const api = new FakeWebApi({
      qdb_form_definition: [
        { qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application', qdb_form_code: 'loan' },
      ],
      [ENTITY_NAMES.LANGUAGE_CONFIG]: [
        { qdb_language_code: 'en', qdb_is_default: true },
        { qdb_language_code: 'ar', qdb_is_default: false },
      ],
      [ENTITY_NAMES.TRANSLATION]: [
        {
          qdb_translationid: 'tr-1',
          qdb_entity_name: 'qdb_form_definition',
          qdb_record_id: FORM_ID,
          qdb_field_name: 'qdb_title',
          qdb_language_code: 'ar',
          qdb_translated_value: 'طلب قرض',
          qdb_source_value: 'Loan Application',
        },
      ],
    });
    renderDialog(api);

    await uploadWorkbook([
      ['qdb_form_definition', FORM_ID, 'qdb_title', '', 'Loan Application', '', 'طلب قرض'],
    ]);
    const check = await screen.findByRole('button', { name: /check without saving/i }, LOADS_EXCELJS);
    await userEvent.click(check);
    await userEvent.click(await screen.findByRole('button', { name: /^apply$/i }, LOADS_EXCELJS));

    await waitFor(() => expect(document.body.textContent).toContain('No changes'), LOADS_EXCELJS);
    expect(screen.queryByRole('button', { name: /publish now/i })).toBeNull();
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

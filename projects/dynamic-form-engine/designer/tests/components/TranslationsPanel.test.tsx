import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TranslationsPanel } from '@/designer/properties/panels/TranslationsPanel';
import { TranslatableStringRow } from '@/designer/properties/panels/TranslationsPanel/TranslatableStringRow';
import type { LanguageConfig } from '@/designer/properties/panels/TranslationsPanel/TranslatableStringRow';

const LANGUAGES = [
  { code: 'en', displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1 },
  { code: 'ar', displayName: 'Arabic', isDefault: false, isRtl: true, displayOrder: 2 },
];

const EMPTY_TRANSLATIONS: [] = [];

function makeLanguageResponse(langs = LANGUAGES) {
  return { success: true, data: langs };
}

function makeTranslationsResponse(data = EMPTY_TRANSLATIONS) {
  return { success: true, data };
}

function mockFetch(langResponse: unknown, translationsResponse: unknown) {
  let callCount = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    callCount++;
    const responseData = callCount === 1 ? langResponse : translationsResponse;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseData),
    });
  }));
}

function renderPanel(props: { entityName?: string; recordId?: string; formCode?: string } = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TranslationsPanel
        entityName={props.entityName ?? 'qdb_form_field'}
        recordId={props.recordId ?? '00000000-0000-0000-0000-000000000001'}
        entityLabel="Field"
        formCode={props.formCode ?? 'test-form'}
      />
    </FluentProvider>
  );
}

describe('TranslationsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('import', { meta: { env: { VITE_API_BASE_URL: '' } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TranslationsPanel_showsLoadingSpinner_initially', () => {
    // fetch never resolves — spinner stays visible
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    renderPanel();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('TranslationsPanel_showsTranslatableFields_afterLoad', async () => {
    mockFetch(makeLanguageResponse(), makeTranslationsResponse());
    renderPanel({ entityName: 'qdb_form_field' });

    await waitFor(() => {
      // qdb_form_field should show "Label" (FIELD_LABEL mapping)
      expect(screen.getByText('Label')).toBeInTheDocument();
    });
  });

  it('TranslationsPanel_showsCompletionIndicator_afterLoad', async () => {
    mockFetch(makeLanguageResponse(), makeTranslationsResponse());
    renderPanel({ entityName: 'qdb_form_field' });

    await waitFor(() => {
      // "0 of N Arabic strings translated" indicator
      expect(screen.getByText(/0 of \d+ strings translated/i)).toBeInTheDocument();
    });
  });

  it('TranslationsPanel_showsErrorMessage_onFetchFailure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/failed to load translations/i)).toBeInTheDocument();
    });
  });
});

describe('TranslatableStringRow', () => {
  const baseLanguages: LanguageConfig[] = [
    { code: 'en', displayName: 'English', isDefault: true, isRtl: false },
    { code: 'ar', displayName: 'Arabic', isDefault: false, isRtl: true },
  ];

  it('TranslatableStringRow_rendersArabicInput_withRtlDir', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();

    render(
      <FluentProvider theme={webLightTheme}>
        <TranslatableStringRow
          fieldName="qdb_label"
          fieldLabel="Label"
          languages={baseLanguages}
          translations={new Map()}
          onSave={onSave}
          onDelete={onDelete}
          isSaving={false}
        />
      </FluentProvider>
    );

    const arabicTextarea = screen.getByPlaceholderText('Enter Arabic translation');
    expect(arabicTextarea).toHaveAttribute('dir', 'rtl');
  });

  it('TranslatableStringRow_rendersEnglishBaseValueRow', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();

    render(
      <FluentProvider theme={webLightTheme}>
        <TranslatableStringRow
          fieldName="qdb_label"
          fieldLabel="Label"
          languages={baseLanguages}
          translations={new Map()}
          onSave={onSave}
          onDelete={onDelete}
          isSaving={false}
        />
      </FluentProvider>
    );

    expect(screen.getByText('English (base)')).toBeInTheDocument();
  });
});

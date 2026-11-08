// Produces the translation workbook for a form, from inside the designer.
//
// Composed of the three reads it needs rather than doing them itself: the string walk, the
// language config, and the translations already stored. Each is separately testable and the
// workbook builder stays a pure function of their output.

import type { IWebApiAdapter } from '../IWebApiAdapter';
import { TranslatableStringsService, type SkippedEntity } from './TranslatableStringsService';
import { LanguageConfigService } from './LanguageConfigService';
import { ExistingTranslationsReader } from './ExistingTranslationsReader';
import { buildTranslationWorkbook } from './translationWorkbook';

export interface TranslationExport {
  readonly buffer: ArrayBuffer;
  readonly fileName: string;
  readonly stringCount: number;
  readonly languages: readonly string[];
  readonly changedCount: number;
  readonly unverifiedCount: number;
  /**
   * Tables that could not be read. Surfaced so the caller can say the workbook is incomplete
   * rather than letting a short export pass for a fully translated form.
   */
  readonly skipped: readonly SkippedEntity[];
}

export class TranslationExportService {
  constructor(
    private readonly strings: TranslatableStringsService,
    private readonly languageConfig: LanguageConfigService,
    private readonly existingTranslations: ExistingTranslationsReader,
  ) {}

  async exportForm(formId: string, formCode: string): Promise<TranslationExport> {
    const [walk, languages] = await Promise.all([
      this.strings.collectForForm(formId),
      this.languageConfig.load(),
    ]);

    const existing = await this.existingTranslations.forRecords(
      walk.rows.map((row) => row.recordId),
    );

    const built = await buildTranslationWorkbook({
      rows: walk.rows,
      languages: languages.targets,
      existing,
      sourceLanguage: languages.source,
    });

    return {
      buffer: built.buffer,
      fileName: workbookFileName(formCode),
      stringCount: walk.rows.length,
      languages: languages.targets.map(({ code }) => code),
      changedCount: built.changedCount,
      unverifiedCount: built.unverifiedCount,
      skipped: walk.skipped,
    };
  }
}

export function createTranslationExportService(webApi: IWebApiAdapter): TranslationExportService {
  return new TranslationExportService(
    new TranslatableStringsService(webApi),
    new LanguageConfigService(webApi),
    new ExistingTranslationsReader(webApi),
  );
}

/** Form codes are user-authored, so anything a file system would object to is replaced. */
function workbookFileName(formCode: string): string {
  const safe = formCode.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return `translations-${safe || 'form'}.xlsx`;
}

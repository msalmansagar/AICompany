// Writes a filled workbook back into qdb_translation.
//
// Non-destructive by design:
//   · a blank cell leaves the existing translation alone — it never means "delete"
//   · a filled cell creates or updates that language's translation
//   · nothing is ever deleted by an import; removing a translation stays a deliberate act
//
// Every key is checked against a real record BEFORE anything is written, and a key that no
// longer resolves aborts the whole import naming the rows. A quietly dropped row is how
// translations go missing, and a half-applied import is worse than one that refused.
//
// Mirrors scripts/translations-import.mjs.

import type { IWebApiAdapter } from '../IWebApiAdapter';
import { CrmTranslationWriteService } from '../TranslationWriteService';
import { ExistingTranslationsReader, type ExistingTranslation } from './ExistingTranslationsReader';
import { TRANSLATABLE_ENTITIES, translationKey } from './translatableSpec';
import type { ParsedTranslationRow, ParsedTranslationWorkbook } from './translationWorkbookParser';

/** Dataverse rejects a filter built from too many ids at once. */
const RECORDS_PER_REQUEST = 20;

export interface ImportOptions {
  /** Report what would happen without writing anything. */
  readonly dryRun: boolean;
}

export interface ImportSummary {
  readonly rowsRead: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Cells left blank by the translator. Counted so a no-op import is visibly a no-op. */
  readonly blank: number;
  readonly dryRun: boolean;
}

export class UnresolvedRecordsError extends Error {
  constructor(readonly unresolved: readonly string[]) {
    super(
      `${unresolved.length} row(s) reference records that no longer exist. `
        + 'Nothing was written — re-export the form and redo the edits.',
    );
    this.name = 'UnresolvedRecordsError';
  }
}

type Outcome = 'created' | 'updated' | 'unchanged' | 'blank';

interface CellWrite {
  readonly row: ParsedTranslationRow;
  readonly language: string;
  readonly existing: ReadonlyMap<string, ExistingTranslation>;
  readonly dryRun: boolean;
}

export class TranslationImportService {
  constructor(
    private readonly writeService: CrmTranslationWriteService,
    private readonly existingTranslations: ExistingTranslationsReader,
    private readonly webApi: IWebApiAdapter,
  ) {}

  async apply(
    workbook: ParsedTranslationWorkbook,
    options: ImportOptions,
  ): Promise<ImportSummary> {
    const unresolved = await this.findUnresolvedRecords(workbook.rows);
    if (unresolved.length) throw new UnresolvedRecordsError(unresolved);

    const existing = await this.existingTranslations.forRecords(
      workbook.rows.map((row) => row.recordId),
    );

    const outcomes: Outcome[] = [];
    for (const row of workbook.rows) {
      for (const language of workbook.languages) {
        outcomes.push(await this.applyCell({ row, language, existing, dryRun: options.dryRun }));
      }
    }

    return summarise(outcomes, workbook.rows.length, options.dryRun);
  }

  private async applyCell({ row, language, existing, dryRun }: CellWrite): Promise<Outcome> {
    const value = row.values[language] ?? '';
    if (!value) return 'blank';

    const found = existing.get(translationKey(row.entity, row.recordId, row.field, language));
    if (found && found.value === value && found.sourceSnapshot === row.source) return 'unchanged';

    if (!dryRun) {
      await this.writeService.upsertTranslation({
        entityName: row.entity,
        recordId: row.recordId,
        fieldName: row.field,
        languageCode: language,
        value,
        sourceValue: row.source,
      });
    }

    return found ? 'updated' : 'created';
  }

  /**
   * Checked per entity with a batched filter rather than one read per record — a form carries
   * hundreds of records, and the pre-flight runs before every import.
   */
  private async findUnresolvedRecords(
    rows: readonly ParsedTranslationRow[],
  ): Promise<readonly string[]> {
    const unresolved: string[] = [];

    for (const [entity, recordIds] of groupRecordIdsByEntity(rows)) {
      const spec = TRANSLATABLE_ENTITIES.find((candidate) => candidate.entity === entity);
      if (!spec) {
        unresolved.push(...recordIds.map((id) => `${entity}(${id}) — not a translatable entity`));
        continue;
      }

      const alive = await this.readLiveIds(entity, spec.idField, recordIds);
      unresolved.push(
        ...recordIds.filter((id) => !alive.has(id.toLowerCase())).map((id) => `${entity}(${id})`),
      );
    }

    return unresolved;
  }

  private async readLiveIds(
    entity: string,
    idField: string,
    recordIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const alive = new Set<string>();

    for (const batch of chunk(recordIds, RECORDS_PER_REQUEST)) {
      const filter = batch.map((id) => `${idField} eq ${id}`).join(' or ');
      const result = await this.webApi.retrieveMultipleRecords(
        entity,
        `?$select=${idField}&$filter=${encodeURIComponent(filter)}`,
      );

      for (const record of result.entities) {
        alive.add(String(record[idField] ?? '').toLowerCase());
      }
    }

    return alive;
  }
}

export function createTranslationImportService(webApi: IWebApiAdapter): TranslationImportService {
  return new TranslationImportService(
    new CrmTranslationWriteService(webApi),
    new ExistingTranslationsReader(webApi),
    webApi,
  );
}

function groupRecordIdsByEntity(
  rows: readonly ParsedTranslationRow[],
): Map<string, readonly string[]> {
  const byEntity = new Map<string, Set<string>>();

  for (const row of rows) {
    const ids = byEntity.get(row.entity) ?? new Set<string>();
    ids.add(row.recordId);
    byEntity.set(row.entity, ids);
  }

  return new Map([...byEntity].map(([entity, ids]) => [entity, [...ids]]));
}

function summarise(outcomes: readonly Outcome[], rowsRead: number, dryRun: boolean): ImportSummary {
  const count = (outcome: Outcome): number => outcomes.filter((o) => o === outcome).length;

  return {
    rowsRead,
    created: count('created'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    blank: count('blank'),
    dryRun,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

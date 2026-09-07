// Collects every translatable string on a form by walking the entity graph in translatableSpec.
//
// scripts/translations-lib.mjs performs the same walk straight against the Dataverse REST API.
// This one goes through IWebApiAdapter so it runs inside the designer web resource, where
// entity-set names are the adapter's problem rather than ours.

import type { IWebApiAdapter, WebApiRecord } from '../IWebApiAdapter';
import {
  TRANSLATABLE_ENTITIES,
  buildTranslatableRows,
  type CollectionScope,
  type TranslatableEntitySpec,
  type TranslatableString,
} from './translatableSpec';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An entity that could not be read. Its strings are missing from the result. */
export interface SkippedEntity {
  readonly entity: string;
  readonly reason: string;
}

export interface TranslatableStrings {
  readonly rows: readonly TranslatableString[];
  /**
   * Reported rather than swallowed. A form that quietly omits a table looks exactly like a
   * form with nothing left to translate, and the difference matters to whoever reads the export.
   */
  readonly skipped: readonly SkippedEntity[];
}

export class TranslatableStringsError extends Error {
  /** Set by hand rather than via ErrorOptions, which this tsconfig's lib predates. */
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TranslatableStringsError';
    this.cause = options?.cause;
  }
}

type ScopeBuckets = Record<CollectionScope, readonly string[]>;

interface LevelResult {
  readonly records: readonly WebApiRecord[];
  readonly skipped?: SkippedEntity;
}

export class TranslatableStringsService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  /** Every translatable string on the form, collected parent-first. */
  async collectForForm(formId: string): Promise<TranslatableStrings> {
    if (!GUID.test(formId)) {
      throw new TranslatableStringsError(`formId is not a GUID: '${formId}'`);
    }

    const byEntity = new Map<string, readonly WebApiRecord[]>();
    const skipped: SkippedEntity[] = [];
    let scopes = seedScopes(formId);

    for (const spec of TRANSLATABLE_ENTITIES) {
      const level = await this.readLevel(spec, scopes);
      if (level.skipped) skipped.push(level.skipped);

      byEntity.set(spec.entity, level.records);
      if (spec.fills) scopes = { ...scopes, [spec.fills]: idsOf(level.records, spec.idField) };
    }

    return { rows: buildTranslatableRows(byEntity), skipped };
  }

  /**
   * No $select: the translatable fields differ per entity, so one shared column list would be
   * rejected by whichever entity lacks a column in it.
   */
  private async readLevel(
    spec: TranslatableEntitySpec,
    scopes: ScopeBuckets,
  ): Promise<LevelResult> {
    const filter = filterFor(spec, scopes);
    if (!filter) return { records: [] };

    try {
      const result = await this.webApi.retrieveMultipleRecords(
        spec.entity,
        `?$filter=${encodeURIComponent(filter)}`,
      );
      return { records: result.entities };
    } catch (error) {
      if (isRoot(spec)) {
        throw new TranslatableStringsError(
          `Cannot read ${spec.entity} for the form being exported.`,
          { cause: error },
        );
      }
      // Info cards and scoped buttons are not provisioned in every org.
      return { records: [], skipped: { entity: spec.entity, reason: messageOf(error) } };
    }
  }
}

function seedScopes(formId: string): ScopeBuckets {
  return { form: [formId], tabs: [], sections: [], fields: [], screens: [], cardSections: [] };
}

function isRoot(spec: TranslatableEntitySpec): boolean {
  return spec.parentField === undefined;
}

/** Null when nothing at the level above matched — there is nothing left to ask for. */
function filterFor(spec: TranslatableEntitySpec, scopes: ScopeBuckets): string | null {
  const ids = scopes[spec.scope];
  if (!ids.length) return null;

  const field = spec.parentField ?? spec.idField;
  return ids.map((id) => `${field} eq ${id}`).join(' or ');
}

/** Ids are interpolated into the next filter, so anything not a GUID is dropped here. */
function idsOf(records: readonly WebApiRecord[], idField: string): readonly string[] {
  return records
    .map((record) => String(record[idField] ?? ''))
    .filter((id) => GUID.test(id));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

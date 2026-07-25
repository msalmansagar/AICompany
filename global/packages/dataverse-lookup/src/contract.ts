/**
 * Canonical Dataverse lookup contract — MSS Technologies global library.
 *
 * The single interface every project uses to resolve lookup options — records
 * from a target entity, or values from an option-set. Replaces the separate
 * lookup services the audit found (CrmLookupService, ApiLookupService,
 * LookupConfigService, optionsApi).
 *
 * Runtime-agnostic: `node/` and `browser/` implementations satisfy this shape.
 * Composes with @mss/dataverse-metadata — option-set resolution delegates to it
 * rather than re-deriving codes (which are 100000000-based, never 0-based).
 */

/** One selectable lookup option. */
export interface LookupOption {
  /** The value — a record id (entity lookup) or an option code (option-set). */
  id: string;
  /** The display label, already resolved to the requested language. */
  label: string;
  /** Source entity, for entity lookups. */
  entity?: string;
  /**
   * Additional column values, keyed by the column's base attribute, for
   * multi-column lookups. The caller (which holds the column config) pairs each
   * configured column with its language-resolved value.
   */
  columns?: Record<string, unknown>;
}

/**
 * A display column for a multi-column, language-aware lookup. `attribute` is
 * the base; `localizedAttributes` maps a language code to the attribute that
 * holds that language's value (e.g. { ar: 'qdb_name_ar' }).
 */
export interface LookupColumn {
  attribute: string;
  localizedAttributes?: Record<string, string>;
}

/** A request to resolve options from records of a target entity. */
export interface EntityLookupQuery {
  entity: string;
  /** The attribute shown to the user (and searched/ordered by). */
  displayAttribute: string;
  /** The attribute used as the option value; defaults to `<entity>id`. */
  valueAttribute?: string;
  /** Free-text search term; matched with a `contains` on the display attribute. */
  searchTerm?: string;
  /** An additional OData `$filter` expression, ANDed with the rest. */
  filter?: string;
  /** Cap on results. Implementations apply a sane default and hard ceiling. */
  maxResults?: number;
  /** Multi-column display; the first column drives search, order, and label. */
  columns?: LookupColumn[];
  /** Requested language (e.g. 'ar'); selects the localized attribute per column. */
  language?: string;
}

/**
 * The lookup service. Options are always returned language-resolved and
 * ready to render; errors are typed, never a silent empty array on failure.
 */
export interface DataverseLookupService {
  /** Resolve options from records of a target entity. */
  searchEntity(query: EntityLookupQuery): Promise<readonly LookupOption[]>;

  /** Resolve options from an entity attribute's option-set (delegates to metadata). */
  searchOptionSet(
    entity: string,
    attribute: string,
    language?: string,
  ): Promise<readonly LookupOption[]>;
}

/** Raised when a lookup cannot be resolved. Carries context for the caller. */
export class LookupError extends Error {
  constructor(
    message: string,
    readonly context: { entity?: string; attribute?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'LookupError';
  }
}

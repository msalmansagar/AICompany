/**
 * Canonical Dataverse metadata contract — MSS Technologies global library.
 *
 * The single interface every project uses to read entity schema, fields, and
 * relationships. Replaces the five separate metadata services the audit found.
 * Runtime-agnostic: `node/` and `browser/` implementations satisfy this shape.
 *
 * Embeds hard-won platform rules so no caller re-learns them:
 * - Entity metadata is read by DIRECT EntityDefinitions(LogicalName='x') lookup,
 *   never a filtered collection scan (which is silently paginated).
 * - Option-set values are the real 100000000-based codes from metadata, never
 *   assumed 0-based ordinals.
 */

/** A single field (attribute) on an entity. */
export interface FieldMetadata {
  logicalName: string;
  displayName: string;
  /** Dataverse attribute type, e.g. "String", "Lookup", "Picklist", "Money". */
  attributeType: string;
  isRequired: boolean;
  isCustom: boolean;
  maxLength?: number;
  /** Present only for Lookup fields — the entities this lookup can target. */
  targets?: readonly string[];
  /** Present only for Picklist/MultiSelect fields. */
  options?: readonly OptionMetadata[];
}

/** One option-set value. `value` is the real metadata code (100000000-based). */
export interface OptionMetadata {
  value: number;
  label: string;
}

/** A relationship from one entity to another. */
export interface RelationshipMetadata {
  schemaName: string;
  /** "OneToMany" | "ManyToOne" | "ManyToMany". */
  relationshipType: string;
  relatedEntity: string;
  /** The navigation property name — PascalCase-prefixed, as metadata reports it. */
  navigationProperty: string;
}

/** An entity's schema: its identity, its fields, and its relationships. */
export interface EntityMetadata {
  logicalName: string;
  displayName: string;
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  fields: readonly FieldMetadata[];
  relationships: readonly RelationshipMetadata[];
}

/**
 * The metadata service. All methods degrade to a typed error, never a silent
 * null, so a missing entity is distinguishable from an empty one.
 */
export interface DataverseMetadataService {
  /** Full schema for one entity, by its logical name. */
  getEntity(logicalName: string): Promise<EntityMetadata>;

  /** Just the fields — the common case ("extract the entity's fields"). */
  getFields(logicalName: string): Promise<readonly FieldMetadata[]>;

  /** The related fields reachable via this entity's relationships. */
  getRelatedFields(logicalName: string): Promise<readonly RelationshipMetadata[]>;

  /** Option-set values for one Picklist/MultiSelect field. */
  getOptions(
    logicalName: string,
    attributeLogicalName: string,
  ): Promise<readonly OptionMetadata[]>;
}

/** Raised when metadata cannot be read. Carries context for the caller. */
export class MetadataError extends Error {
  constructor(
    message: string,
    readonly context: { entity?: string; attribute?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'MetadataError';
  }
}

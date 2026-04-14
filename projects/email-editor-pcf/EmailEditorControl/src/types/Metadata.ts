/**
 * Metadata.ts
 * TypeScript shapes for Dataverse Web API v9.2 metadata responses.
 * Only fields actually used by MetadataService are included — no fat interfaces.
 */

export interface LocalizedLabel {
  readonly Label: string;
  readonly LanguageCode: number;
}

export interface DisplayName {
  readonly UserLocalizedLabel: LocalizedLabel | null;
}

export interface EntityMetadata {
  readonly LogicalName: string;
  readonly SchemaName: string;
  readonly DisplayName: DisplayName;
  readonly PrimaryIdAttribute: string;
  readonly PrimaryNameAttribute: string;
  readonly ObjectTypeCode: number;
  readonly EntitySetName: string;
}

export type AttributeType =
  | 'String'
  | 'Memo'
  | 'Integer'
  | 'Decimal'
  | 'Money'
  | 'Double'
  | 'Boolean'
  | 'DateTime'
  | 'Lookup'
  | 'Owner'
  | 'Customer'
  | 'Picklist'
  | 'State'
  | 'Status'
  | 'UniqueIdentifier'
  | 'Virtual'
  | string;

export interface AttributeMetadata {
  readonly LogicalName: string;
  readonly SchemaName: string;
  readonly DisplayName: DisplayName;
  readonly AttributeType: AttributeType;
  readonly IsValidForRead: boolean;
  readonly IsCustomAttribute: boolean;
}

export interface OneToManyRelationship {
  readonly SchemaName: string;
  readonly ReferencedEntity: string;
  readonly ReferencedAttribute: string;
  readonly ReferencingEntity: string;
  readonly ReferencingAttribute: string;
  readonly ReferencedEntityNavigationPropertyName: string;
  readonly ReferencingEntityNavigationPropertyName: string;
}

export interface ManyToOneRelationship {
  readonly SchemaName: string;
  readonly ReferencedEntity: string;
  readonly ReferencedAttribute: string;
  readonly ReferencingEntity: string;
  readonly ReferencingAttribute: string;
  readonly ReferencingEntityNavigationPropertyName: string;
}

export interface OptionSetOption {
  readonly Value: number;
  readonly Label: DisplayName;
}

export interface OptionSetMetadata {
  readonly Options: readonly OptionSetOption[];
}

/** Merged shape used by the field picker popup rows */
export type PickerRow =
  | { readonly kind: 'attribute'; readonly meta: AttributeMetadata }
  | { readonly kind: 'manyToOne'; readonly rel: ManyToOneRelationship }
  | { readonly kind: 'oneToMany'; readonly rel: OneToManyRelationship };

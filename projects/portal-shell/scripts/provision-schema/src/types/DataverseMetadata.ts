// Typed shapes for Dataverse OData v4 metadata API payloads.
// These match the wire format exactly — no library abstraction.

export interface LocalizedLabel {
  readonly Label: string;
  readonly LanguageCode: number;
}

export interface LocalizedLabelSet {
  readonly LocalizedLabels: readonly LocalizedLabel[];
}

export interface RequiredLevelValue {
  readonly Value: 'None' | 'SystemRequired' | 'ApplicationRequired' | 'Recommended';
}

// ── Attribute types ────────────────────────────────────────────────────────────

export interface BaseAttributeMetadata {
  readonly '@odata.type': string;
  readonly SchemaName: string;
  readonly LogicalName: string;
  readonly DisplayName: LocalizedLabelSet;
  readonly RequiredLevel: RequiredLevelValue;
}

export interface StringAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
  readonly MaxLength: number;
}

export interface MemoAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata';
  readonly MaxLength: number;
}

export interface IntegerAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
  readonly MinValue?: number;
  readonly MaxValue?: number;
  readonly DefaultValue?: number;
}

export interface BooleanAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
  readonly DefaultValue: boolean;
}

export interface DateTimeAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';
  readonly DateTimeBehavior?: { readonly Value: string };
}

export interface OptionMetadata {
  readonly Value: number;
  readonly Label: LocalizedLabelSet;
}

export interface OptionSetReference {
  readonly Name: string;
}

export interface PicklistAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
  readonly GlobalOptionSet?: OptionSetReference;
  readonly OptionSet?: {
    readonly Options: readonly OptionMetadata[];
  };
  readonly DefaultFormValue?: number;
}

export interface LookupAttributeMetadata extends BaseAttributeMetadata {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
  readonly Targets: readonly string[];
}

export type AttributeMetadata =
  | StringAttributeMetadata
  | MemoAttributeMetadata
  | IntegerAttributeMetadata
  | BooleanAttributeMetadata
  | DateTimeAttributeMetadata
  | PicklistAttributeMetadata
  | LookupAttributeMetadata;

// ── Entity metadata ────────────────────────────────────────────────────────────

export interface EntityMetadataPayload {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata';
  readonly SchemaName: string;
  readonly DisplayName: LocalizedLabelSet;
  readonly DisplayCollectionName: LocalizedLabelSet;
  readonly Description: LocalizedLabelSet;
  readonly OwnershipType: 'UserOwned' | 'OrganizationOwned';
  readonly HasActivities: false;
  readonly HasNotes: false;
  readonly IsActivity: false;
  readonly PrimaryNameAttribute: string;
  readonly Attributes: readonly AttributeMetadata[];
}

// ── Option set metadata ────────────────────────────────────────────────────────

export interface GlobalOptionSetPayload {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata';
  readonly Name: string;
  readonly DisplayName: LocalizedLabelSet;
  readonly Description: LocalizedLabelSet;
  readonly IsGlobal: true;
  readonly OptionSetType: 'Picklist';
  readonly Options: readonly OptionMetadata[];
}

// ── Relationship metadata ──────────────────────────────────────────────────────

export interface AssociatedMenuConfiguration {
  readonly Behavior: 'DoNotDisplay' | 'UseCollectionName' | 'UseLabel';
  readonly Group: 'Details' | 'Sales' | 'Service' | 'Marketing';
  readonly Order: number | null;
  readonly IsCustomizable: { readonly Value: boolean };
}

export interface CascadeConfiguration {
  readonly Assign: string;
  readonly Delete: string;
  readonly Merge: string;
  readonly Reparent: string;
  readonly Share: string;
  readonly Unshare: string;
}

export interface LookupAttributeInRelationship {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
  readonly SchemaName: string;
  readonly LogicalName: string;
  readonly DisplayName: LocalizedLabelSet;
  readonly RequiredLevel: RequiredLevelValue;
}

export interface OneToManyRelationshipPayload {
  readonly '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata';
  readonly SchemaName: string;
  readonly ReferencedEntity: string;
  readonly ReferencingEntity: string;
  readonly ReferencedAttribute: string;
  readonly ReferencingAttribute: string;
  readonly Lookup: LookupAttributeInRelationship;
  readonly AssociatedMenuConfiguration: AssociatedMenuConfiguration;
  readonly CascadeConfiguration: CascadeConfiguration;
}

// ── OData response shapes ──────────────────────────────────────────────────────

export interface ODataCollectionResponse<T> {
  readonly value: readonly T[];
  readonly '@odata.nextLink'?: string;
}

export interface PublisherRecord {
  readonly publisherid: string;
  readonly friendlyname: string;
  readonly customizationprefix: string;
}

export interface SolutionRecord {
  readonly solutionid: string;
  readonly uniquename: string;
  readonly version: string;
  readonly solutionpackageversion?: string;
}

export interface RoleRecord {
  readonly roleid: string;
  readonly name: string;
}

export interface PrivilegeRecord {
  readonly privilegeid: string;
  readonly name: string;
}

export interface EntityDefinitionRecord {
  readonly MetadataId: string;
  readonly LogicalName: string;
  readonly SchemaName: string;
}

export interface GlobalOptionSetRecord {
  readonly MetadataId: string;
  readonly Name: string;
  readonly Options: readonly OptionMetadata[];
}

export interface RelationshipRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
}

export interface SystemUserRecord {
  readonly systemuserid: string;
  readonly fullname: string;
}

export interface BusinessUnitRecord {
  readonly businessunitid: string;
  readonly name: string;
}

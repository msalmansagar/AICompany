/**
 * Builds Dataverse Web API metadata payloads from manifest entries. Pure: no network, no clock.
 *
 * @module survey-provisioning/payloads
 */
import { createHash } from 'node:crypto';

const MAX_RELATIONSHIP_NAME_LENGTH = 100;

/**
 * @param {string} text
 * @param {number} languageCode
 * @returns {object} A Dataverse Label with one localized label.
 */
export function label(text, languageCode) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: languageCode }],
  };
}

const requiredLevel = (isRequired) => ({ Value: isRequired ? 'ApplicationRequired' : 'None' });

/**
 * Entity create payload carrying the primary name and every manifest column, so the table
 * arrives complete in one call: a column created separately right after its new table can
 * 404 while metadata propagates (GOT-013).
 *
 * @param {import('../manifest.mjs').TableSpec} table
 * @param {number} languageCode
 */
export function buildEntityPayload(table, languageCode) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: table.name,
    DisplayName: label(table.label, languageCode),
    DisplayCollectionName: label(table.pluralLabel, languageCode),
    Description: label(table.description, languageCode),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: table.hasActivities === true,
    IsAuditEnabled: { Value: table.isAuditEnabled === true, CanBeChanged: true },
    Attributes: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_name',
      IsPrimaryName: true,
      MaxLength: 200,
      FormatName: { Value: 'Text' },
      RequiredLevel: requiredLevel(false),
      DisplayName: label('Name', languageCode),
    }, ...table.columns.map((column) => buildAttributePayload(column, languageCode))],
  };
}

const ATTRIBUTE_BUILDERS = {
  string: (column) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', MaxLength: column.maxLength, FormatName: { Value: 'Text' } }),
  memo: (column) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', MaxLength: column.maxLength, Format: 'TextArea' }),
  integer: (column) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', Format: 'None', MinValue: column.min ?? -2147483648, MaxValue: column.max ?? 2147483647 }),
  decimal: (column) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', Precision: column.precision, MinValue: -100000000000, MaxValue: 100000000000 }),
  datetime: (column) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', Format: column.format, DateTimeBehavior: { Value: column.format === 'DateOnly' ? 'DateOnly' : 'UserLocal' } }),
  boolean: (column, languageCode) => ({
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    DefaultValue: column.defaultValue === true,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: label('Yes', languageCode) },
      FalseOption: { Value: 0, Label: label('No', languageCode) },
    },
  }),
  picklist: (column, languageCode) => ({
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    ...(column.defaultValue != null ? { DefaultFormValue: column.defaultValue } : {}),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: column.options.map((option) => ({ Value: option.value, Label: label(option.label, languageCode) })),
    },
  }),
};

/**
 * Column create payload for every non-lookup column type the manifest uses.
 *
 * @param {import('../manifest.mjs').ColumnSpec} column
 * @param {number} languageCode
 * @throws {Error} For a column type the manifest does not support.
 */
export function buildAttributePayload(column, languageCode) {
  const buildTypeSpecific = ATTRIBUTE_BUILDERS[column.type];
  if (!buildTypeSpecific) throw new Error(`Unsupported column type '${column.type}' on ${column.name}`);
  return {
    SchemaName: column.name,
    DisplayName: label(column.label, languageCode),
    RequiredLevel: requiredLevel(column.required === true),
    ...buildTypeSpecific(column, languageCode),
  };
}

/**
 * One-to-many relationship payload, which also creates the lookup column.
 *
 * @param {{ lookup: string, label: string, from: string, to: string, cascade: string, required?: boolean }} relationship
 * @param {number} languageCode
 */
export function buildRelationshipPayload(relationship, languageCode) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: relationshipSchemaName(relationship),
    ReferencedEntity: relationship.to,
    ReferencingEntity: relationship.from,
    CascadeConfiguration: {
      Assign: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade', Reparent: 'NoCascade', Merge: 'NoCascade',
      Delete: relationship.cascade,
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: relationship.lookup,
      DisplayName: label(relationship.label, languageCode),
      RequiredLevel: requiredLevel(relationship.required === true),
    },
  };
}

/**
 * The relationship schema name: referenced_referencing_lookup, shortened with a stable hash
 * suffix when it would exceed the platform limit, so re-runs always produce the same name.
 */
export function relationshipSchemaName({ lookup, from, to }) {
  const fullName = `${to}_${from}_${lookup}`;
  if (fullName.length <= MAX_RELATIONSHIP_NAME_LENGTH) return fullName;
  const suffix = createHash('sha256').update(fullName).digest('hex').slice(0, 8);
  return `${fullName.slice(0, MAX_RELATIONSHIP_NAME_LENGTH - 9)}_${suffix}`;
}

/**
 * @param {{ name: string, label: string, columns: string[] }} key
 * @param {number} languageCode
 */
export function buildAlternateKeyPayload(key, languageCode) {
  return { SchemaName: key.name, DisplayName: label(key.label, languageCode), KeyAttributes: key.columns };
}

/**
 * Platform privilege names for one role entry, e.g. prvReadqdb_survey_answer. Dataverse
 * compares privilege names case-insensitively, so logical names work for system tables too.
 *
 * @param {{ table: string, rights: string[] }} privilege
 * @returns {string[]}
 */
export function privilegeNamesFor(privilege) {
  // A named privilege that is not a table right, e.g. prvExportToExcel (B8).
  if (privilege.name) return [privilege.name];
  return privilege.rights.map((right) => `prv${right}${privilege.table}`);
}

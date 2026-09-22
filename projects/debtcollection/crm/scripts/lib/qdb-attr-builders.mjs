/**
 * qdb-attr-builders.mjs
 *
 * ⚠️  AUTHORED, NOT PROVISIONED. Nothing in this file has been executed against any CRM
 *     organisation. Running provisioning requires explicit user go-ahead, every time.
 *
 * Additional attribute builders needed by the `qdb_` schema that `attr-builders.mjs` does not
 * provide. Deliberately a NEW file rather than an edit to `attr-builders.mjs`: that file is a
 * dependency of the live `msst_` provisioning on org5869857f, and Phase 1 follows
 * create-new-then-migrate — the deployed path stays untouched until retirement is approved.
 *
 * Everything here re-exports the existing builders so a `qdb-*` definition file has one import.
 */
export {
  strAttr, memoAttr, intAttr, moneyAttr, boolAttr, dtAttr, picklistAttr, piiStrAttr,
} from './attr-builders.mjs';

import { label1033, emptyLabel } from './labels.mjs';

/** @param {string} level */
function reqLevel(level) {
  return { Value: level, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };
}

/**
 * Memo with an explicit MaxLength. The base `memoAttr` fixes 2000, but the field dictionaries
 * call for 4000 (remarks, resolution) and 100000 (body, payload, error detail).
 * @param {string} logicalName @param {string} displayLabel @param {number} [maxLen] @param {string} [req]
 */
export function memoAttrN(logicalName, displayLabel, maxLen = 2000, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    AttributeType: 'Memo', AttributeTypeName: { Value: 'MemoType' },
    SchemaName: logicalName, LogicalName: logicalName,
    MaxLength: maxLen,
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/**
 * Decimal attribute. Needed for `qdb_arrearpercentage` (7,4) and `qdb_exemptionpercentage` (5,4),
 * which are ratios in 0..1 and must not be rounded to money precision.
 * MinValue is deliberately negative-capable: the MIS exemption amount arrives negative and the
 * sign convention is `TBD — Requires QDB Confirmation`, so nothing here may assume it is positive.
 * @param {string} logicalName @param {string} displayLabel @param {number} [precision]
 * @param {string} [req] @param {number} [min] @param {number} [max]
 */
export function decAttr(logicalName, displayLabel, precision = 2, req = 'None', min = -100000000000, max = 100000000000) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
    AttributeType: 'Decimal', AttributeTypeName: { Value: 'DecimalType' },
    SchemaName: logicalName, LogicalName: logicalName,
    Precision: precision, MinValue: min, MaxValue: max,
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/**
 * Date-only attribute (no time component) — `qdb_firstarreardate` is a business date from MIS.
 * DateOnly + UserLocal keeps it stable across time zones.
 * @param {string} logicalName @param {string} displayLabel @param {string} [req]
 */
export function dateAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    AttributeType: 'DateTime', AttributeTypeName: { Value: 'DateTimeType' },
    SchemaName: logicalName, LogicalName: logicalName,
    Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' },
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/**
 * Multi-select choice referencing an existing global option set.
 * Used by `qdb_collectionactivitytype.qdb_applicablecustomertype` / `qdb_applicableproduct`.
 *
 * MultiSelectPicklist is a v9.0+ feature, so it is available on Dynamics 365 CE 9.1 on-premises as
 * well as Dataverse — it does not break the dual-platform rule.
 * @param {string} logicalName @param {string} displayLabel @param {string} globalSetName @param {string} [req]
 */
export function multiPicklistAttr(logicalName, displayLabel, globalSetName, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata',
    AttributeType: 'Virtual', AttributeTypeName: { Value: 'MultiSelectPicklistType' },
    SchemaName: logicalName, LogicalName: logicalName,
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: true, Name: globalSetName },
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/**
 * Builds a one-to-many relationship definition (a lookup on the referencing entity).
 *
 * Lookups are NOT part of an EntityDefinition's Attributes array — they are created through
 * /RelationshipDefinitions after both entities exist, which is why the existing schema keeps them
 * in `relationship-defs.mjs`. Same convention here.
 *
 * @param {object} p
 * @param {string} p.schemaName      relationship schema name, e.g. 'qdb_collectioncase_activity'
 * @param {string} p.referencing     entity that gets the lookup column
 * @param {string} p.referenced      entity pointed at
 * @param {string} p.lookupLogical   lookup column logical name
 * @param {string} p.lookupLabel     lookup column display name
 * @param {string} [p.req]           requirement level on the lookup column
 */
export function oneToMany({ schemaName, referencing, referenced, lookupLogical, lookupLabel, req = 'None' }) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName,
    ReferencedEntity: referenced,
    ReferencingEntity: referencing,
    CascadeConfiguration: {
      Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade',
      Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade',
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      AttributeType: 'Lookup', AttributeTypeName: { Value: 'LookupType' },
      SchemaName: lookupLogical, LogicalName: lookupLogical,
      DisplayName: label1033(lookupLabel), Description: emptyLabel(),
      RequiredLevel: reqLevel(req),
    },
  };
}

/**
 * Builds the body for the **CreateCustomerRelationships** action — the only supported way to create
 * a `Customer` lookup, which is a single column that can point at EITHER `contact` OR `account`.
 *
 * A plain lookup cannot do this: a lookup's target is fixed metadata. The Customer type is what lets
 * ONE canonical column (`qdb_customerid`) serve HL (contact) and BFD (account) without a second
 * column and without any branch in Collection logic — Correction Prompt §4.
 *
 * Verified available on both targets: `CreateCustomerRelationshipsRequest` ships in the on-premises
 * SDK (Microsoft.Xrm.Sdk 9.0.2.51) and the `CreateCustomerRelationships` action is present on the
 * cloud organisation; `incident.customerid` is the out-of-box reference implementation.
 *
 * @param {object} p
 * @param {string} p.referencing    entity that gets the Customer column
 * @param {string} p.lookupLogical  e.g. 'qdb_customerid'
 * @param {string} p.lookupLabel    e.g. 'Customer'
 * @param {string} p.relPrefix      relationship schema prefix, e.g. 'qdb_collectioncase_customer'
 * @param {string} [p.req]
 */
export function customerLookup({ referencing, lookupLogical, lookupLabel, relPrefix, req = 'None' }) {
  const lookup = {
    // CreateCustomerRelationships is an action, so its parameters are OData *complex* types rather
    // than the entity types /EntityDefinitions/Attributes accepts. Sending LookupAttributeMetadata
    // here is rejected: "found to be of kind 'Entity' instead of the expected kind 'Complex'".
    '@odata.type': 'Microsoft.Dynamics.CRM.ComplexLookupAttributeMetadata',
    AttributeType: 'Customer', AttributeTypeName: { Value: 'CustomerType' },
    SchemaName: lookupLogical, LogicalName: lookupLogical,
    DisplayName: label1033(lookupLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
  const rel = (referenced, suffix) => ({
    '@odata.type': 'Microsoft.Dynamics.CRM.ComplexOneToManyRelationshipMetadata',
    SchemaName: `${relPrefix}_${suffix}`,
    ReferencedEntity: referenced,
    ReferencingEntity: referencing,
    CascadeConfiguration: {
      Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade',
      Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade',
    },
  });
  return {
    action: 'CreateCustomerRelationships',
    body: {
      Lookup: lookup,
      OneToManyRelationships: [rel('account', 'account'), rel('contact', 'contact')],
    },
  };
}

/**
 * attr-builders.mjs
 * Factory functions for Dataverse Web API attribute metadata definitions.
 * Each returns the JSON body fragment used inside an EntityDefinition's Attributes array.
 */
import { label1033, emptyLabel } from './labels.mjs';

/** @param {string} level */
function reqLevel(level) {
  return { Value: level, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };
}

/** @param {string} logicalName @param {string} displayLabel @param {number} [maxLen] @param {string} [req] */
export function strAttr(logicalName, displayLabel, maxLen = 200, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    AttributeType: 'String', AttributeTypeName: { Value: 'StringType' },
    SchemaName: logicalName, LogicalName: logicalName,
    MaxLength: maxLen,
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/** @param {string} logicalName @param {string} displayLabel @param {string} [req] */
export function memoAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    AttributeType: 'Memo', AttributeTypeName: { Value: 'MemoType' },
    SchemaName: logicalName, LogicalName: logicalName,
    MaxLength: 2000,
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/** @param {string} logicalName @param {string} displayLabel @param {string} [req] */
export function intAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    AttributeType: 'Integer', AttributeTypeName: { Value: 'IntegerType' },
    SchemaName: logicalName, LogicalName: logicalName,
    MinValue: 0, MaxValue: 2147483647, Format: 'None',
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/** @param {string} logicalName @param {string} displayLabel @param {string} [req] */
export function moneyAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
    AttributeType: 'Money', AttributeTypeName: { Value: 'MoneyType' },
    SchemaName: logicalName, LogicalName: logicalName,
    PrecisionSource: 2,
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/** @param {string} logicalName @param {string} displayLabel @param {string} [req] */
export function boolAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    AttributeType: 'Boolean', AttributeTypeName: { Value: 'BooleanType' },
    SchemaName: logicalName, LogicalName: logicalName,
    DefaultValue: false,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption:  { Value: 1, Label: label1033('Yes'), Description: emptyLabel() },
      FalseOption: { Value: 0, Label: label1033('No'),  Description: emptyLabel() },
    },
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/** @param {string} logicalName @param {string} displayLabel @param {string} [req] */
export function dtAttr(logicalName, displayLabel, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    AttributeType: 'DateTime', AttributeTypeName: { Value: 'DateTimeType' },
    SchemaName: logicalName, LogicalName: logicalName,
    Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' },
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
  };
}

/**
 * Picklist referencing an existing global option set by name.
 * @param {string} logicalName @param {string} displayLabel @param {string} globalSetName @param {string} [req]
 */
export function picklistAttr(logicalName, displayLabel, globalSetName, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType: 'Picklist', AttributeTypeName: { Value: 'PicklistType' },
    SchemaName: logicalName, LogicalName: logicalName,
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: true, Name: globalSetName },
    DisplayName: label1033(displayLabel), Description: emptyLabel(),
    RequiredLevel: reqLevel(req),
    IsSecured: false,
  };
}

/**
 * String attribute with IsSecured = true (field-level security, PII masking).
 * @param {string} logicalName @param {string} displayLabel @param {number} [maxLen] @param {string} [req]
 */
export function piiStrAttr(logicalName, displayLabel, maxLen = 200, req = 'None') {
  return { ...strAttr(logicalName, displayLabel, maxLen, req), IsSecured: true };
}

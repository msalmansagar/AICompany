// Shared builder helpers for entity definitions.
// Keeps individual definition files lean and free of repeated label boilerplate.
import type {
  LocalizedLabelSet,
  RequiredLevelValue,
  PicklistAttributeMetadata,
  LookupAttributeMetadata,
  BooleanAttributeMetadata,
  BooleanOptionSetMetadata,
} from '../../types/DataverseMetadata.js';

export function label(text: string): LocalizedLabelSet {
  return { LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] };
}

export function requiredLevel(
  level: RequiredLevelValue['Value'],
): RequiredLevelValue {
  return { Value: level };
}

export function globalPicklist(
  schemaName: string,
  logicalName: string,
  displayLabel: string,
  optionSetName: string,
): PicklistAttributeMetadata {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: logicalName,
    DisplayName: label(displayLabel),
    RequiredLevel: requiredLevel('None'),
    // OptionSet with IsGlobal+Name is the correct format for entity creation via OData
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: true,
      Name: optionSetName,
    },
  };
}

export function lookup(
  schemaName: string,
  logicalName: string,
  displayLabel: string,
  targets: readonly string[],
): LookupAttributeMetadata {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: logicalName,
    DisplayName: label(displayLabel),
    RequiredLevel: requiredLevel('None'),
    Targets: targets,
  };
}

export function requiredLookup(
  schemaName: string,
  logicalName: string,
  displayLabel: string,
  targets: readonly string[],
): LookupAttributeMetadata {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: logicalName,
    DisplayName: label(displayLabel),
    RequiredLevel: requiredLevel('ApplicationRequired'),
    Targets: targets,
  };
}

function booleanOptionSet(trueLabel: string, falseLabel: string): BooleanOptionSetMetadata {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label(trueLabel) },
    FalseOption: { Value: 0, Label: label(falseLabel) },
  };
}

export function booleanField(
  schemaName: string,
  logicalName: string,
  displayLabel: string,
  defaultValue: boolean,
): BooleanAttributeMetadata {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: logicalName,
    DisplayName: label(displayLabel),
    RequiredLevel: requiredLevel('None'),
    DefaultValue: defaultValue,
    OptionSet: booleanOptionSet('Yes', 'No'),
  };
}

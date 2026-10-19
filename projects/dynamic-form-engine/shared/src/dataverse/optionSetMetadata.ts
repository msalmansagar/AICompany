// Dataverse expands an attribute's OptionSet only through the attribute's own metadata type.
// Casting a multi-select or status choice to PicklistAttributeMetadata answers 404, so the
// cast has to follow the AttributeTypeName read from the attribute first.
const OPTION_SET_METADATA_CASTS: Readonly<Record<string, string>> = {
  PicklistType: 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
  MultiSelectPicklistType: 'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata',
  StatusType: 'Microsoft.Dynamics.CRM.StatusAttributeMetadata',
  StateType: 'Microsoft.Dynamics.CRM.StateAttributeMetadata',
};

export class UnsupportedOptionSourceError extends Error {
  constructor(attributeTypeName: string) {
    super(`An option source must be a choice attribute; this one is ${attributeTypeName}`);
    this.name = 'UnsupportedOptionSourceError';
  }
}

/** The metadata cast that exposes OptionSet for an attribute's AttributeTypeName.Value. */
export function optionSetMetadataCast(attributeTypeName: string): string {
  const cast = OPTION_SET_METADATA_CASTS[attributeTypeName];
  if (!cast) throw new UnsupportedOptionSourceError(attributeTypeName);
  return cast;
}

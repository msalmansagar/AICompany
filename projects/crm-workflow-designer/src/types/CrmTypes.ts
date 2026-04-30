export interface CrmContext {
  recordId: string | null;
  entityName: string | null;
  userId: string | null;
  orgUrl: string;
}

export interface EntityMetadata {
  logicalName: string;
  displayName: string;
  entitySetName: string;
  attributes: AttributeMetadata[];
}

export interface AttributeMetadata {
  logicalName: string;
  displayName: string;
  attributeType: string;
}

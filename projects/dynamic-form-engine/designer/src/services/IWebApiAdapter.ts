// Minimal interface covering every Xrm.WebApi method used by designer services.
// Implemented by CrmWebApiAdapter (wraps Xrm) and RestWebApiAdapter (wraps backend proxy).

export type WebApiRecord = Record<string, unknown>;

export interface WebApiCreateResult {
  id: string;
  entityType: string;
}

export interface WebApiRetrieveMultipleResult {
  entities: WebApiRecord[];
  nextLink?: string;
}

export interface ActionParameters {
  [key: string]: unknown;
}

export interface ActionResult {
  [key: string]: unknown;
}

export interface IWebApiAdapter {
  createRecord(entityLogicalName: string, data: WebApiRecord): Promise<WebApiCreateResult>;
  updateRecord(entityLogicalName: string, id: string, data: WebApiRecord): Promise<void>;
  deleteRecord(entityLogicalName: string, id: string): Promise<void>;
  retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<WebApiRecord>;
  retrieveMultipleRecords(entityLogicalName: string, options?: string): Promise<WebApiRetrieveMultipleResult>;
  executeAction(actionName: string, parameters: ActionParameters): Promise<ActionResult>;
}

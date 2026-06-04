// Xrm namespace type augmentation for CRM web resource context.
// Provides type safety for Xrm.WebApi calls used throughout the service layer.
// Minimum API level: Dynamics 365 v9.2 on-premise and Online.

declare namespace Xrm {
  namespace WebApi {
    function createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string; entityType: string }>;
    function updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }>;
    function deleteRecord(entityLogicalName: string, id: string): Promise<{ id: string }>;
    function retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Record<string, unknown>>;
    function retrieveMultipleRecords(
      entityLogicalName: string,
      options?: string,
      maxPageSize?: number
    ): Promise<{ entities: Array<Record<string, unknown>>; nextLink?: string }>;
  }

  namespace Utility {
    function showProgressIndicator(message: string): void;
    function closeProgressIndicator(): void;
    function getEntityMetadata(entityLogicalName: string, attributes?: string[]): Promise<EntityMetadata>;
    function getGlobalContext(): GlobalContext;
  }

  interface GlobalContext {
    getClientUrl(): string;
    /** Returns the current user GUID wrapped in curly braces, e.g. {xxxxxxxx-...} */
    getUserId(): string;
    /** Returns the current user's display name */
    getUserName(): string;
  }

  namespace App {
    function addGlobalNotification(notification: GlobalNotification): Promise<string>;
    function clearGlobalNotification(id: string): Promise<void>;
  }

  interface EntityMetadata {
    LogicalName: string;
    DisplayName: string;
    Attributes: Record<string, AttributeMetadata>;
  }

  interface AttributeMetadata {
    LogicalName: string;
    DisplayName: string;
    AttributeType: string;
  }

  interface GlobalNotification {
    type: number;
    level: number;
    message: string;
    showCloseButton?: boolean;
    action?: {
      actionLabel: string;
      eventHandler: () => void;
    };
  }
}

// Augment Window to allow safe parent.Xrm access
interface Window {
  Xrm: typeof Xrm;
}

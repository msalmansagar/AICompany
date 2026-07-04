// Xrm namespace type augmentation for CRM web resource context.
// Provides type safety for Xrm.WebApi calls used throughout the service layer.
//
// Minimum on-premise version: Dynamics 365 9.0 (on-prem) with Unified Interface.
// Xrm.WebApi (createRecord / updateRecord / deleteRecord / retrieveRecord /
// retrieveMultipleRecords) was introduced in Dynamics CRM 8.2 and is available
// on all D365 9.x on-prem builds. Xrm.Utility.getGlobalContext() requires 9.x.
// Recommend D365 9.1 on-prem minimum for full UCI stability.
//
// RestWebApiAdapter (standalone/dev mode) targets /api/data/v9.1 by default via
// VITE_API_BASE_URL. In CRM-hosted mode Xrm.WebApi abstracts the version so the
// target API version is transparent.

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

    namespace online {
      function execute(request: unknown): Promise<unknown>;
    }
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

  namespace Navigation {
    interface OpenWebResourceOptions {
      height?: number;
      width?: number;
      openInNewWindow?: boolean;
    }
    /** Opens a web resource in a dialog/window, passing `data` as its ?data= query parameter. */
    function openWebResource(
      webResourceName: string,
      windowOptions?: OpenWebResourceOptions,
      data?: string,
    ): void;
    /** Navigates to a page (form, dashboard, or web resource) inline, inline dialog, or new window. */
    function navigateTo(pageInput: unknown, navigationOptions?: unknown): Promise<unknown>;
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

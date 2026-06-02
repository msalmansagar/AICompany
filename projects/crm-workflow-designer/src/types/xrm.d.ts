declare namespace Xrm {
  namespace WebApi {
    function createRecord(
      name: string,
      data: Record<string, unknown>
    ): Promise<{ id: string; entityType: string }>;

    function updateRecord(
      name: string,
      id: string,
      data: Record<string, unknown>
    ): Promise<{ id: string; entityType: string }>;

    function deleteRecord(
      name: string,
      id: string
    ): Promise<{ id: string; entityType: string }>;

    function retrieveRecord(
      name: string,
      id: string,
      options?: string
    ): Promise<Record<string, unknown>>;

    function retrieveMultipleRecords(
      name: string,
      options?: string,
      maxPageSize?: number
    ): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>;
  }

  namespace Utility {
    function getGlobalContext(): GlobalContext;
  }

  interface GlobalContext {
    getClientUrl(): string;
    getVersion(): string;
    getUserId(): string;
    getUserName(): string;
    getOrgUniqueName(): string;
  }
}

// Xrm is accessed at runtime via (window as Record<string, unknown>)['Xrm']
// to avoid global augmentation conflicts with the declare namespace above.

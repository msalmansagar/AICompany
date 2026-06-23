import type { DataverseClient } from '@portal/dataverse-client';
import type { LinkedEntity } from '@portal/types';

const USER_ENTITY_JUNCTION = 'qdb_portal_user_entities';

interface DataverseUserEntity {
  qdb_portal_user_entityid: string;
  qdb_user_id: string;
  '_qdb_account_id_value': string;
  'qdb_account_id@OData.Community.Display.V1.FormattedValue'?: string;
}

interface DataverseAccount {
  accountid: string;
  name: string;
  qdb_sub_type: string;
  qdb_logo_url: string | null;
}

/**
 * Resolves the list of entities (companies/accounts) linked to the
 * authenticated user — used to populate the entity switcher.
 *
 * Queries the junction table qdb_portal_user_entity → expands account details.
 */
export class EntityService {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns all entities linked to the given user ID.
   *
   * @param userId - Authenticated user's ID
   * @param correlationId - Request correlation ID
   */
  async getLinkedEntities(userId: string, correlationId?: string): Promise<LinkedEntity[]> {
    const junctionRecords = await this.loadJunctionRecords(userId, correlationId);
    const accountIds = junctionRecords.map((r) => r['_qdb_account_id_value']);

    if (accountIds.length === 0) {
      return [];
    }

    const accounts = await this.loadAccounts(accountIds, correlationId);
    return accounts.map((account) => this.mapToLinkedEntity(account));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadJunctionRecords(
    userId: string,
    correlationId?: string,
  ): Promise<DataverseUserEntity[]> {
    const result = await this.dataverse.getList<DataverseUserEntity>(
      USER_ENTITY_JUNCTION,
      {
        select: ['qdb_portal_user_entityid', 'qdb_user_id', '_qdb_account_id_value'],
        filter: `qdb_user_id eq '${userId}'`,
        top: 100,
      },
      { correlationId },
    );
    return result.value;
  }

  private async loadAccounts(
    accountIds: string[],
    correlationId?: string,
  ): Promise<DataverseAccount[]> {
    // Build OData filter for up to 100 account IDs
    const filter = accountIds
      .map((id) => `accountid eq ${id}`)
      .join(' or ');

    const result = await this.dataverse.getList<DataverseAccount>(
      'accounts',
      {
        select: ['accountid', 'name', 'qdb_sub_type', 'qdb_logo_url'],
        filter,
        top: accountIds.length,
      },
      { correlationId },
    );

    return result.value;
  }

  private mapToLinkedEntity(account: DataverseAccount): LinkedEntity {
    return {
      id: account.accountid,
      name: account.name,
      subType: account.qdb_sub_type ?? '',
      logoUrl: account.qdb_logo_url,
    };
  }
}

import type { DataverseClient } from '@portal/dataverse-client';
import type { NavItem } from '@portal/types';

const NAV_ITEM_ENTITY = 'qdb_portal_nav_items';

interface DataverseNavItem {
  qdb_portal_nav_itemid: string;
  qdb_label: string;
  qdb_label_ar: string;
  qdb_icon: string;
  qdb_page_code: string;
  qdb_display_order: number;
  qdb_is_visible: boolean;
  qdb_badge_source: number; // 860000001=none, 860000002=static, 860000003=query
  qdb_badge_value: string | null;
  qdb_required_role: string | null;
  '_qdb_parent_id_value': string | null;
}

const BADGE_SOURCE_MAP: Record<number, NavItem['badgeSource']> = {
  860000001: 'none',
  860000002: 'static',
  860000003: 'query',
};

/**
 * Loads navigation items from Dataverse, resolves live badge counts for
 * items with badgeSource === 'query', filters by the user's roles, and
 * assembles the parent-child tree.
 */
export class NavService {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns the navigation tree for the authenticated user.
   *
   * @param userRoles - Roles from the authenticated user's JWT claims
   * @param correlationId - Request correlation ID for Dataverse logging
   */
  async getNavTree(userRoles: string[], correlationId?: string): Promise<NavItem[]> {
    const allItems = await this.loadAllNavItems(correlationId);
    const visibleItems = this.filterByVisibilityAndRole(allItems, userRoles);
    const withBadges = await this.resolveBadgeCounts(visibleItems, correlationId);
    return this.buildTree(withBadges);
  }

  /**
   * Creates a new nav item in Dataverse.
   */
  async createNavItem(
    body: Record<string, unknown>,
    correlationId?: string,
  ): Promise<DataverseNavItem> {
    return this.dataverse.create<DataverseNavItem>(NAV_ITEM_ENTITY, body, { correlationId });
  }

  /**
   * Updates an existing nav item in Dataverse.
   */
  async updateNavItem(
    id: string,
    patch: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.dataverse.update(NAV_ITEM_ENTITY, id, patch, { correlationId });
  }

  /**
   * Deletes a nav item from Dataverse.
   */
  async deleteNavItem(id: string, correlationId?: string): Promise<void> {
    await this.dataverse.delete(NAV_ITEM_ENTITY, id, { correlationId });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadAllNavItems(correlationId?: string): Promise<DataverseNavItem[]> {
    const result = await this.dataverse.getList<DataverseNavItem>(
      NAV_ITEM_ENTITY,
      {
        select: [
          'qdb_portal_nav_itemid',
          'qdb_label',
          'qdb_label_ar',
          'qdb_icon',
          'qdb_page_code',
          'qdb_display_order',
          'qdb_is_visible',
          'qdb_badge_source',
          'qdb_badge_value',
          'qdb_required_role',
          '_qdb_parent_id_value',
        ],
        filter: 'statecode eq 0',
        orderBy: 'qdb_display_order asc',
      },
      { correlationId },
    );
    return result.value;
  }

  private filterByVisibilityAndRole(
    items: DataverseNavItem[],
    userRoles: string[],
  ): DataverseNavItem[] {
    return items.filter((item) => {
      if (!item.qdb_is_visible) return false;
      if (item.qdb_required_role && !userRoles.includes(item.qdb_required_role)) return false;
      return true;
    });
  }

  private async resolveBadgeCounts(
    items: DataverseNavItem[],
    correlationId?: string,
  ): Promise<NavItem[]> {
    const resolved = await Promise.all(
      items.map(async (item) => {
        const navItem = this.mapToNavItem(item);
        if (navItem.badgeSource === 'query' && navItem.badgeValue) {
          navItem.liveCount = await this.executeBadgeQuery(
            navItem.badgeValue,
            correlationId,
          );
        }
        return navItem;
      }),
    );
    return resolved;
  }

  /**
   * Executes the OData query stored in badgeValue against Dataverse and
   * returns the record count. The query string is the entity set name +
   * optional filter, stored as: "entity_name?$filter=...".
   */
  private async executeBadgeQuery(query: string, correlationId?: string): Promise<number> {
    const [entityPart, filterPart] = query.split('?');
    const entityName = entityPart?.trim() ?? '';
    const filterParam = filterPart?.replace('$filter=', '').trim();

    const result = await this.dataverse.getList<Record<string, unknown>>(
      entityName,
      {
        select: ['createdon'],
        filter: filterParam,
        top: 1,
        count: true,
      },
      { correlationId },
    );

    return result['@odata.count'] ?? result.value.length;
  }

  private buildTree(flatItems: NavItem[]): NavItem[] {
    const itemMap = new Map<string, NavItem>(
      flatItems.map((item) => [item.id, { ...item, children: [] }]),
    );

    const roots: NavItem[] = [];

    for (const item of itemMap.values()) {
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        if (parent) {
          (parent.children ??= []).push(item);
        } else {
          // Orphaned child — promote to root
          roots.push(item);
        }
      } else {
        roots.push(item);
      }
    }

    return roots.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  private mapToNavItem(record: DataverseNavItem): NavItem {
    return {
      id: record.qdb_portal_nav_itemid,
      label: record.qdb_label,
      labelAr: record.qdb_label_ar,
      icon: record.qdb_icon,
      pageCode: record.qdb_page_code,
      displayOrder: record.qdb_display_order,
      isVisible: record.qdb_is_visible,
      badgeSource: BADGE_SOURCE_MAP[record.qdb_badge_source] ?? 'none',
      badgeValue: record.qdb_badge_value,
      requiredRole: record.qdb_required_role,
      parentId: record['_qdb_parent_id_value'],
    };
  }
}

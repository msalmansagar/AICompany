// RED → GREEN → REFACTOR — NavService unit tests

import { describe, it, expect, vi } from 'vitest';
import { NavService } from './NavService.js';
import type { DataverseClient } from '@portal/dataverse-client';

const NAV_RECORDS = [
  {
    qdb_portal_nav_itemid: 'item-001',
    qdb_label: 'Dashboard',
    qdb_label_ar: 'لوحة القيادة',
    qdb_icon: 'Home',
    qdb_page_code: '/dashboard',
    qdb_display_order: 1,
    qdb_is_visible: true,
    qdb_badge_source: 860000001, // none
    qdb_badge_value: null,
    qdb_required_role: null,
    '_qdb_parent_id_value': null,
  },
  {
    qdb_portal_nav_itemid: 'item-002',
    qdb_label: 'Admin',
    qdb_label_ar: 'الإدارة',
    qdb_icon: 'Settings',
    qdb_page_code: '/admin',
    qdb_display_order: 2,
    qdb_is_visible: true,
    qdb_badge_source: 860000001,
    qdb_badge_value: null,
    qdb_required_role: 'Admin',
    '_qdb_parent_id_value': null,
  },
  {
    qdb_portal_nav_itemid: 'item-003',
    qdb_label: 'My Requests',
    qdb_label_ar: 'طلباتي',
    qdb_icon: 'Document',
    qdb_page_code: '/requests',
    qdb_display_order: 3,
    qdb_is_visible: false, // hidden
    qdb_badge_source: 860000001,
    qdb_badge_value: null,
    qdb_required_role: null,
    '_qdb_parent_id_value': null,
  },
];

function buildMockDataverse(): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: NAV_RECORDS }),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as DataverseClient;
}

describe('NavService.getNavTree', () => {
  it('should_return_only_visible_items', async () => {
    const service = new NavService(buildMockDataverse());
    const tree = await service.getNavTree([]);

    const labels = tree.map((item) => item.label);
    expect(labels).not.toContain('My Requests'); // hidden
  });

  it('should_filter_out_items_requiring_role_not_held_by_user', async () => {
    const service = new NavService(buildMockDataverse());
    const tree = await service.getNavTree([]); // no roles

    const labels = tree.map((item) => item.label);
    expect(labels).not.toContain('Admin');
    expect(labels).toContain('Dashboard');
  });

  it('should_include_role_guarded_items_when_user_has_the_role', async () => {
    const service = new NavService(buildMockDataverse());
    const tree = await service.getNavTree(['Admin']);

    const labels = tree.map((item) => item.label);
    expect(labels).toContain('Admin');
    expect(labels).toContain('Dashboard');
  });

  it('should_assemble_parent_child_tree_correctly', async () => {
    const dvMock = {
      getList: vi.fn().mockResolvedValue({
        value: [
          { ...NAV_RECORDS[0], '_qdb_parent_id_value': null },
          {
            qdb_portal_nav_itemid: 'child-001',
            qdb_label: 'Sub Page',
            qdb_label_ar: '',
            qdb_icon: 'Circle',
            qdb_page_code: '/dashboard/sub',
            qdb_display_order: 1,
            qdb_is_visible: true,
            qdb_badge_source: 860000001,
            qdb_badge_value: null,
            qdb_required_role: null,
            '_qdb_parent_id_value': 'item-001',
          },
        ],
      }),
      getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), executeAction: vi.fn(),
    } as unknown as DataverseClient;

    const service = new NavService(dvMock);
    const tree = await service.getNavTree([]);

    expect(tree).toHaveLength(1); // only one root
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children?.[0]?.label).toBe('Sub Page');
  });
});

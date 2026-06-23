// RED → GREEN → REFACTOR — PortalConfigService unit tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalConfigService } from './PortalConfigService.js';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { DataverseClient } from '@portal/dataverse-client';

const MOCK_DV_RECORD = {
  qdb_portal_configid: 'config-001',
  qdb_portal_name: 'My Portal',
  qdb_logo_url: 'https://cdn.example.com/logo.png',
  qdb_favicon_url: 'https://cdn.example.com/favicon.ico',
  qdb_primary_color: '#0078d4',
  qdb_accent_color: '#00b4d8',
  qdb_font_family: 'Inter',
  qdb_background_color: '#ffffff',
  qdb_nav_layout: 860000001,
  qdb_sidebar_default_state: 860000001,
  qdb_auth_provider: 860000003,
  qdb_sso_providers: '[]',
  qdb_landing_page: '/dashboard',
  qdb_rtl_enabled: false,
  qdb_header_show_entity_switcher: true,
  qdb_header_show_support: true,
  qdb_header_support_label: 'Help',
  qdb_header_support_url: 'https://support.example.com',
  qdb_header_show_notifications: true,
  qdb_footer_left_logo_url: '',
  qdb_footer_right_logo_url: '',
  qdb_footer_powered_by_text: 'Powered by Maqsad',
  qdb_footer_links: '[]',
  qdb_notification_poll_interval_seconds: 30,
};

function buildMockDataverse(record: unknown = MOCK_DV_RECORD): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [record] }),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as DataverseClient;
}

describe('PortalConfigService.getActiveConfig', () => {
  it('should_return_mapped_portal_config_when_dataverse_returns_record', async () => {
    const service = new PortalConfigService(buildMockDataverse(), 300);
    const config = await service.getActiveConfig();

    expect(config.id).toBe('config-001');
    expect(config.portalName).toBe('My Portal');
    expect(config.navLayout).toBe('sidebar');
    expect(config.authProvider).toBe('custom');
    expect(config.notificationPollIntervalSeconds).toBe(30);
  });

  it('should_serve_from_cache_on_second_call', async () => {
    const dvMock = buildMockDataverse();
    const service = new PortalConfigService(dvMock, 300);

    await service.getActiveConfig();
    await service.getActiveConfig();

    // getList should only have been called once — second hit from cache
    expect(dvMock.getList).toHaveBeenCalledTimes(1);
  });

  it('should_throw_DataverseNotFoundError_when_no_active_config_exists', async () => {
    const emptyDvMock = {
      getList: vi.fn().mockResolvedValue({ value: [] }),
    } as unknown as DataverseClient;

    const service = new PortalConfigService(emptyDvMock, 300);
    await expect(service.getActiveConfig()).rejects.toBeInstanceOf(DataverseNotFoundError);
  });
});

describe('PortalConfigService.purgeCache', () => {
  it('should_cause_next_getActiveConfig_call_to_hit_dataverse', async () => {
    const dvMock = buildMockDataverse();
    const service = new PortalConfigService(dvMock, 300);

    await service.getActiveConfig();
    service.purgeCache();
    await service.getActiveConfig();

    expect(dvMock.getList).toHaveBeenCalledTimes(2);
  });
});

describe('PortalConfigService.updateConfig', () => {
  it('should_call_dataverse_update_and_purge_cache', async () => {
    const dvMock = buildMockDataverse();
    const service = new PortalConfigService(dvMock, 300);

    // Warm the cache
    await service.getActiveConfig();

    await service.updateConfig('config-001', { qdb_portal_name: 'New Name' });

    expect(dvMock.update).toHaveBeenCalledWith(
      'qdb_portal_configs',
      'config-001',
      { qdb_portal_name: 'New Name' },
      {},
    );

    // After update cache is purged — next call should hit Dataverse
    await service.getActiveConfig();
    expect(dvMock.getList).toHaveBeenCalledTimes(2);
  });
});

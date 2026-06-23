import NodeCache from 'node-cache';
import type { DataverseClient } from '@portal/dataverse-client';
import type { PortalConfig } from '@portal/types';
import { DataverseNotFoundError } from '@portal/dataverse-client';

const PORTAL_CONFIG_ENTITY = 'qdb_portal_configs';
const CACHE_KEY = 'portal_config_active';

/** Dataverse record shape — logical names match qdb_ publisher prefix */
interface DataversePortalConfig {
  qdb_portal_configid: string;
  qdb_portal_name: string;
  qdb_logo_url: string;
  qdb_favicon_url: string;
  qdb_primary_color: string;
  qdb_accent_color: string;
  qdb_font_family: string;
  qdb_background_color: string;
  qdb_nav_layout: number; // 860000001 = sidebar, 860000002 = top-nav
  qdb_sidebar_default_state: number; // 860000001 = expanded, 860000002 = collapsed
  qdb_auth_provider: number; // 860000001 = azure-ad-b2c, 860000002 = entra-external-id, 860000003 = custom
  qdb_sso_providers: string; // JSON array
  qdb_landing_page: string;
  qdb_rtl_enabled: boolean;
  qdb_header_show_entity_switcher: boolean;
  qdb_header_show_support: boolean;
  qdb_header_support_label: string;
  qdb_header_support_url: string;
  qdb_header_show_notifications: boolean;
  qdb_footer_left_logo_url: string;
  qdb_footer_right_logo_url: string;
  qdb_footer_powered_by_text: string;
  qdb_footer_links: string; // JSON array
  qdb_notification_poll_interval_seconds: number;
}

const NAV_LAYOUT_MAP: Record<number, 'sidebar' | 'top-nav'> = {
  860000001: 'sidebar',
  860000002: 'top-nav',
};

const SIDEBAR_STATE_MAP: Record<number, 'expanded' | 'collapsed'> = {
  860000001: 'expanded',
  860000002: 'collapsed',
};

const AUTH_PROVIDER_MAP: Record<number, PortalConfig['authProvider']> = {
  860000001: 'azure-ad-b2c',
  860000002: 'entra-external-id',
  860000003: 'custom',
};

/**
 * Loads and caches the active portal configuration from Dataverse.
 *
 * Caches the result for CACHE_TTL_PORTAL_CONFIG seconds. Admin PATCH route
 * calls purgeCache() to invalidate immediately.
 */
export class PortalConfigService {
  private readonly dataverse: DataverseClient;
  private readonly cache: NodeCache;
  private readonly cacheTtlSeconds: number;

  constructor(dataverse: DataverseClient, cacheTtlSeconds: number) {
    this.dataverse = dataverse;
    this.cacheTtlSeconds = cacheTtlSeconds;
    this.cache = new NodeCache({ stdTTL: cacheTtlSeconds, checkperiod: 60 });
  }

  /**
   * Returns the active portal configuration.
   * Serves from in-memory cache when available; fetches from Dataverse otherwise.
   */
  async getActiveConfig(correlationId?: string): Promise<PortalConfig> {
    const cached = this.cache.get<PortalConfig>(CACHE_KEY);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.dataverse.getList<DataversePortalConfig>(
      PORTAL_CONFIG_ENTITY,
      {
        select: this.selectFields(),
        filter: 'statecode eq 0',
        top: 1,
      },
      { correlationId },
    );

    const record = result.value[0];
    if (!record) {
      throw new DataverseNotFoundError(PORTAL_CONFIG_ENTITY, 'active');
    }

    const config = this.mapToPortalConfig(record);
    this.cache.set(CACHE_KEY, config, this.cacheTtlSeconds);
    return config;
  }

  /**
   * Applies a partial update to the active portal configuration in Dataverse
   * and purges the cache so the next request fetches fresh data.
   */
  async updateConfig(
    id: string,
    patch: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.dataverse.update(PORTAL_CONFIG_ENTITY, id, patch, { correlationId });
    this.purgeCache();
  }

  /** Removes the cached portal config entry so the next fetch hits Dataverse. */
  purgeCache(): void {
    this.cache.del(CACHE_KEY);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapToPortalConfig(record: DataversePortalConfig): PortalConfig {
    return {
      id: record.qdb_portal_configid,
      portalName: record.qdb_portal_name,
      logoUrl: record.qdb_logo_url,
      faviconUrl: record.qdb_favicon_url,
      primaryColor: record.qdb_primary_color,
      accentColor: record.qdb_accent_color,
      fontFamily: record.qdb_font_family,
      backgroundColor: record.qdb_background_color,
      navLayout: NAV_LAYOUT_MAP[record.qdb_nav_layout] ?? 'sidebar',
      sidebarDefaultState: SIDEBAR_STATE_MAP[record.qdb_sidebar_default_state] ?? 'expanded',
      authProvider: AUTH_PROVIDER_MAP[record.qdb_auth_provider] ?? 'custom',
      ssoProviders: this.parseJsonArray<'microsoft' | 'google'>(record.qdb_sso_providers),
      landingPage: record.qdb_landing_page,
      rtlEnabled: record.qdb_rtl_enabled ?? false,
      headerShowEntitySwitcher: record.qdb_header_show_entity_switcher ?? false,
      headerShowSupport: record.qdb_header_show_support ?? false,
      headerSupportLabel: record.qdb_header_support_label ?? '',
      headerSupportUrl: record.qdb_header_support_url ?? '',
      headerShowNotifications: record.qdb_header_show_notifications ?? true,
      footerLeftLogoUrl: record.qdb_footer_left_logo_url ?? '',
      footerRightLogoUrl: record.qdb_footer_right_logo_url ?? '',
      footerPoweredByText: record.qdb_footer_powered_by_text ?? '',
      footerLinks: this.parseJsonArray(record.qdb_footer_links),
      notificationPollIntervalSeconds: record.qdb_notification_poll_interval_seconds ?? 30,
    };
  }

  private parseJsonArray<T>(value: string | undefined | null): T[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private selectFields(): string[] {
    return [
      'qdb_portal_configid',
      'qdb_portal_name',
      'qdb_logo_url',
      'qdb_favicon_url',
      'qdb_primary_color',
      'qdb_accent_color',
      'qdb_font_family',
      'qdb_background_color',
      'qdb_nav_layout',
      'qdb_sidebar_default_state',
      'qdb_auth_provider',
      'qdb_sso_providers',
      'qdb_landing_page',
      'qdb_rtl_enabled',
      'qdb_header_show_entity_switcher',
      'qdb_header_show_support',
      'qdb_header_support_label',
      'qdb_header_support_url',
      'qdb_header_show_notifications',
      'qdb_footer_left_logo_url',
      'qdb_footer_right_logo_url',
      'qdb_footer_powered_by_text',
      'qdb_footer_links',
      'qdb_notification_poll_interval_seconds',
    ];
  }
}

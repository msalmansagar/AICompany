import { z } from 'zod';

// ---------------------------------------------------------------------------
// Portal Config domain types
// ---------------------------------------------------------------------------

export interface FooterLink {
  label: string;
  url: string;
}

export interface PortalConfig {
  id: string;
  portalName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  backgroundColor: string;
  navLayout: 'sidebar' | 'top-nav';
  sidebarDefaultState: 'expanded' | 'collapsed';
  authProvider: 'azure-ad-b2c' | 'entra-external-id' | 'custom';
  ssoProviders: Array<'microsoft' | 'google'>;
  landingPage: string;
  rtlEnabled: boolean;
  headerShowEntitySwitcher: boolean;
  headerShowSupport: boolean;
  headerSupportLabel: string;
  headerSupportUrl: string;
  headerShowNotifications: boolean;
  footerLeftLogoUrl: string;
  footerRightLogoUrl: string;
  footerPoweredByText: string;
  footerLinks: FooterLink[];
  /** Seconds between notification polls. Range: 10–120. Default: 30 (CEO Condition 5). */
  notificationPollIntervalSeconds: number;
}

// ---------------------------------------------------------------------------
// Zod schemas for request bodies
// ---------------------------------------------------------------------------

export const FooterLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const PortalConfigPatchSchema = z.object({
  portalName: z.string().min(1).optional(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().min(1).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  navLayout: z.enum(['sidebar', 'top-nav']).optional(),
  sidebarDefaultState: z.enum(['expanded', 'collapsed']).optional(),
  authProvider: z.enum(['azure-ad-b2c', 'entra-external-id', 'custom']).optional(),
  ssoProviders: z.array(z.enum(['microsoft', 'google'])).optional(),
  landingPage: z.string().min(1).optional(),
  rtlEnabled: z.boolean().optional(),
  headerShowEntitySwitcher: z.boolean().optional(),
  headerShowSupport: z.boolean().optional(),
  headerSupportLabel: z.string().optional(),
  headerSupportUrl: z.string().url().optional(),
  headerShowNotifications: z.boolean().optional(),
  footerLeftLogoUrl: z.string().url().optional(),
  footerRightLogoUrl: z.string().url().optional(),
  footerPoweredByText: z.string().optional(),
  footerLinks: z.array(FooterLinkSchema).optional(),
  notificationPollIntervalSeconds: z.number().int().min(10).max(120).optional(),
});

export type PortalConfigPatch = z.infer<typeof PortalConfigPatchSchema>;

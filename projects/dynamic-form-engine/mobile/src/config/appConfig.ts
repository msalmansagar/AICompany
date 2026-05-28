import { z } from 'zod';
import Constants from 'expo-constants';

const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
const PLACEHOLDER_URL = 'https://placeholder.example.com';

const MobileAppConfigSchema = z.object({
  apiBaseUrl: z.string().url().default(PLACEHOLDER_URL),
  msalClientId: z.string().default(PLACEHOLDER_UUID),
  backendAppClientId: z.string().default(PLACEHOLDER_UUID),
  azureAdTenantId: z.string().default(PLACEHOLDER_UUID),
  webPortalUrl: z.string().url().default(PLACEHOLDER_URL),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>;

function isPlaceholder(value: string): boolean {
  return value === PLACEHOLDER_UUID || value === PLACEHOLDER_URL;
}

function loadAppConfig(): MobileAppConfig {
  const extra = Constants.expoConfig?.extra ?? {};
  const result = MobileAppConfigSchema.safeParse({
    apiBaseUrl: extra.apiBaseUrl,
    msalClientId: extra.msalClientId,
    backendAppClientId: extra.backendAppClientId,
    azureAdTenantId: extra.azureAdTenantId,
    webPortalUrl: extra.webPortalUrl,
    logLevel: extra.logLevel,
  });

  if (!result.success) {
    throw new Error(`Invalid app configuration: ${result.error.message}`);
  }

  return result.data;
}

export function isAppConfigured(): boolean {
  return (
    !isPlaceholder(appConfig.msalClientId) &&
    !isPlaceholder(appConfig.backendAppClientId) &&
    !isPlaceholder(appConfig.azureAdTenantId) &&
    !isPlaceholder(appConfig.apiBaseUrl)
  );
}

export const appConfig = loadAppConfig();

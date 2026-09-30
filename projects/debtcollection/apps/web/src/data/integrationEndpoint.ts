import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, ORG_CODES, PLATFORM_CONFIGURATION_COLUMNS } from './schema.js';

/**
 * Where the Integration Service is, and how to sign in to it, for one organisation's workspace.
 *
 * Every operation that crosses organisations — raising a complaint, reading a Complaint's or a
 * Legal record's status — goes through the Integration Service; the browser never signs in to
 * BFD CRM. The address is this organisation's configuration (its `qdb_platformconfiguration`
 * flags), so DEV, TEST, UAT and PROD, cloud or on-prem, each point at their own service.
 */

/** Key in `qdb_platformconfiguration.qdb_featureflags`. */
export const INTEGRATION_SERVICE_FLAG = 'integrationServiceUrl';

export interface IntegrationEndpoint {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}

export type IntegrationEndpointAvailability =
  | { kind: 'available'; endpoint: IntegrationEndpoint }
  | { kind: 'unavailable'; reason: string };

/** The service address from the organisation's flags, only if it is an https URL. */
export function readIntegrationServiceUrl(featureFlags: unknown): string | undefined {
  const raw = String(featureFlags ?? '').trim();
  if (!raw) return undefined;
  const url = parseFlags(raw)?.[INTEGRATION_SERVICE_FLAG];
  return typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url) ? url : undefined;
}

function parseFlags(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    // Unparseable flags configure nothing; the caller reports the service as unavailable.
    return undefined;
  }
}

/** Resolves the endpoint, or says in words an officer or administrator can act on why not. */
export async function resolveIntegrationEndpoint(
  adapter: XrmCrmAdapter,
  organization: string,
  getAccessToken: (() => Promise<string>) | undefined,
): Promise<IntegrationEndpointAvailability> {
  const code = ORG_CODES[organization];
  if (code === undefined) return unavailable(`The case names organisation "${organization}", which has no configuration.`);
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS], filter: `qdb_organizationcode eq ${code} and qdb_isactive eq true`, top: 2,
  });
  if (rows.length !== 1) return unavailable(`The ${organization} platform configuration is missing or ambiguous.`);
  const baseUrl = readIntegrationServiceUrl(rows[0]!['qdb_featureflags']);
  if (!baseUrl) return unavailable(`The Integration Service address is not configured for ${organization}.`);
  if (!getAccessToken) return unavailable('Sign-in to the Integration Service is not set up in this workspace yet.');
  return { kind: 'available', endpoint: { baseUrl: baseUrl.replace(/\/$/, ''), getAccessToken } };
}

function unavailable(reason: string): IntegrationEndpointAvailability {
  return { kind: 'unavailable', reason };
}

/** POSTs JSON to the service as the user; returns the parsed body, or throws the service's refusal. */
export async function postToIntegrationService(
  endpoint: IntegrationEndpoint,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${endpoint.baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await endpoint.getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new IntegrationServiceError(String(parsed['code'] ?? 'request_failed'), String(parsed['message'] ?? `The service answered ${response.status}`), response.status);
  }
  return parsed;
}

/** The service refused, with its own code and message — shown to the officer as given. */
export class IntegrationServiceError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'IntegrationServiceError';
  }
}

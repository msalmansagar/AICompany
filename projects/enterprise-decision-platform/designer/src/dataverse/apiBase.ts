// The one Web API base for every designer client (data, metadata, runtime).
//
// Dual-mode: inside CRM the base comes from the Xrm global context; local dev goes
// through the /dataverse vite proxy (which injects a service-principal token).
//
// Version-aware: the endpoint version is derived from the org version, because
// Dynamics 365 on-premises does not expose /api/data/v9.2 — a 9.0 org serves
// v9.0 and hardcoding v9.2 404s every call. Cloud orgs report 9.2.x and keep
// the previous behaviour.

const FALLBACK_VERSION = '9.2';

function xrmContext(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  try {
    return w.Xrm?.Utility?.getGlobalContext?.() ?? w.parent?.Xrm?.Utility?.getGlobalContext?.() ?? null;
  } catch {
    return null; // cross-origin parent — not hosted inside CRM
  }
}

/** "major.minor" endpoint version for an org version string, e.g. "9.0.2.3034" → "9.0". */
export function endpointVersion(orgVersion: string | undefined | null): string {
  const m = typeof orgVersion === 'string' ? orgVersion.match(/^(\d+)\.(\d+)/) : null;
  return m ? `${m[1]}.${m[2]}` : FALLBACK_VERSION;
}

/** Web API base inside CRM, or null when not hosted in CRM (callers fall back to a dev proxy). */
export function crmApiBase(): string | null {
  const ctx = xrmContext();
  if (ctx?.getClientUrl) return `${ctx.getClientUrl()}/api/data/v${endpointVersion(ctx.getVersion?.())}`;
  // Hosted as a web resource (same-origin, session-authenticated) but no Xrm in scope.
  // Only cloud hosts match this suffix, so the cloud version is safe here.
  if (typeof location !== 'undefined' && location.hostname.endsWith('.dynamics.com')) return `/api/data/v${FALLBACK_VERSION}`;
  return null;
}

/** Web API base everywhere: CRM when hosted there, otherwise the local /dataverse dev proxy. */
export function apiBase(): string {
  return crmApiBase() ?? '/dataverse';
}

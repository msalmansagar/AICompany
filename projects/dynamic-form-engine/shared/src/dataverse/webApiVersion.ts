// The Web API path must follow the server's own version: on-prem 9.1 answers /api/data/v9.2
// with a 500, while v9.0 is served by every 9.x server, cloud and on-prem alike.
const FALLBACK_WEB_API_VERSION = 'v9.0';
const MAJOR_MINOR_PATTERN = /^(\d+)\.(\d+)/;

/** The Web API version segment for a server version such as Xrm's getVersion() "9.1.0.643". */
export function webApiVersionFor(serverVersion: string | undefined): string {
  const match = MAJOR_MINOR_PATTERN.exec(serverVersion ?? '');
  return match ? `v${match[1]}.${match[2]}` : FALLBACK_WEB_API_VERSION;
}

/** The org's Web API base URL, e.g. https://host/org/api/data/v9.1. */
export function webApiBaseUrlFor(clientUrl: string, serverVersion: string | undefined): string {
  return `${clientUrl.replace(/\/$/, '')}/api/data/${webApiVersionFor(serverVersion)}`;
}

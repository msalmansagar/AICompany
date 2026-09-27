/**
 * Which workspace opens — V1, the protected current experience, or V2, the one under review.
 *
 * **V1 is the default, and everything uncertain resolves to it.** Only an explicit, recognised
 * request opens V2: a missing, malformed or unknown value, a blocked storage, or no storage at all
 * all land on V1. V2 is never promoted by accident.
 *
 * The choice is a presentation preference, not business data. It lives in the browser's own
 * storage and nowhere in Dataverse.
 */

export type WorkspaceVersion = 'v1' | 'v2';

export const DEFAULT_VERSION: WorkspaceVersion = 'v1';
export const VERSION_STORAGE_KEY = 'dcp.workspaceVersion';
const URL_PARAMETER = 'ui';

/** A recognised version, or nothing. Case is forgiven; anything else is not. */
export function parseVersion(value: string | null | undefined): WorkspaceVersion | undefined {
  const normalised = value?.trim().toLowerCase();
  return normalised === 'v1' || normalised === 'v2' ? normalised : undefined;
}

/**
 * The version a URL asks for.
 *
 * Read from `?ui=` on the frame's own address, or from `?data=`, which is the one parameter
 * Dynamics passes through to a web resource opened at `main.aspx` — arbitrary parameters on
 * `main.aspx` itself are refused.
 */
export function readUrlVersion(search: string): WorkspaceVersion | undefined {
  const params = new URLSearchParams(search);
  const direct = parseVersion(params.get(URL_PARAMETER));
  if (direct) return direct;
  const data = params.get('data');
  if (!data) return undefined;
  return parseVersion(new URLSearchParams(data).get(URL_PARAMETER));
}

/** The saved preference, or nothing — a blocked storage is not an error, just no answer. */
export function recallVersion(storage?: Storage): WorkspaceVersion | undefined {
  try {
    return parseVersion(storage?.getItem(VERSION_STORAGE_KEY));
  } catch {
    // Some profiles block storage outright. That is a missing preference, never a failure.
    return undefined;
  }
}

/** Saves the choice. A storage that refuses is tolerated: the choice then lasts this page only. */
export function rememberVersion(version: WorkspaceVersion, storage?: Storage): void {
  try {
    storage?.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    // Deliberately tolerated, for the same reason as above.
  }
}

/** URL first, then the saved preference, then V1. */
export function resolveWorkspaceVersion(input: { search: string; storage?: Storage }): WorkspaceVersion {
  return readUrlVersion(input.search) ?? recallVersion(input.storage) ?? DEFAULT_VERSION;
}

/** The browser's storage when there is one and it can be reached; otherwise nothing. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

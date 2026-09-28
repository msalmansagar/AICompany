import { useEffect, useState } from 'react';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * Who recorded a promise: an officer, or an integration.
 *
 * A record written by the DFE backend or the MIS loader is owned by an application user, and the
 * platform renders that user's name — `# DFE Backend API` — like any other. That name means nothing
 * to a Collection Officer and leaks an internal component into the list. The application users are a
 * small, bounded set the organisation can name (`applicationid` is set on them and on nothing else),
 * so they are read once per session and a promise owned by one is shown as recorded by the system.
 *
 * Read as the signed-in user; a refusal leaves the set empty and the platform's name shows as before,
 * which is honest rather than a guess.
 */

const cache = new WeakMap<XrmCrmAdapter, Promise<ReadonlySet<string>>>();

export function loadApplicationUserIds(adapter: XrmCrmAdapter): Promise<ReadonlySet<string>> {
  const remembered = cache.get(adapter);
  if (remembered) return remembered;
  const loading = adapter
    .retrieveMultiple('systemusers', { select: ['systemuserid'], filter: 'applicationid ne null' })
    .then(rows => new Set(rows.map(row => String(row['systemuserid']).toLowerCase())) as ReadonlySet<string>)
    .catch((): ReadonlySet<string> => new Set());
  cache.set(adapter, loading);
  return loading;
}

const NONE: ReadonlySet<string> = new Set();

/** The application user ids, empty until read — and empty when the organisation would not say. */
export function useApplicationUsers(adapter: XrmCrmAdapter): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    let cancelled = false;
    loadApplicationUserIds(adapter).then(loaded => { if (!cancelled) setIds(loaded); });
    return () => { cancelled = true; };
  }, [adapter]);
  return ids;
}

export const SYSTEM_RECORDER = 'System';

/** The name to show for who recorded a record: the officer, or `System` for an integration. */
export function describeRecorder(
  record: { ownerId?: string | undefined; ownerName?: string | undefined },
  applicationUsers: ReadonlySet<string>,
): string {
  if (record.ownerId && applicationUsers.has(record.ownerId.toLowerCase())) return SYSTEM_RECORDER;
  return record.ownerName ?? '—';
}

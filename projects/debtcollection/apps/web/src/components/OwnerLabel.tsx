import { useApplicationUsers } from '../data/applicationUsers.js';
import { useCrmSession } from '../shell/context.js';

/** Shown on a record owned by a service identity; the owner record itself is never changed. */
export const SYSTEM_OWNER_HINT = 'Recorded by an integration. The technical owner is shown in audit and administration.';

/**
 * Who holds a record. An application user — `# DFE Backend API`, the MIS loader — reads as
 * "System", because its technical name means nothing to an officer; anyone else by name. Nothing
 * known reads as "Not assigned", never as a blank.
 */
export function OwnerLabel({ ownerId, ownerName }: { ownerId?: string | undefined; ownerName?: string | undefined }) {
  const { adapter } = useCrmSession();
  const applicationUsers = useApplicationUsers(adapter);
  if (ownerId && applicationUsers.has(ownerId.toLowerCase())) {
    return <span className="c360-owner-system" title={SYSTEM_OWNER_HINT} data-testid="c360-owner-system">System</span>;
  }
  return <span data-testid="c360-owner">{ownerName ?? 'Not assigned'}</span>;
}

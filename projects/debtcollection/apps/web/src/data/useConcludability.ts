import { useEffect, useState } from 'react';
import { concludability, type ConcludeAvailability } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { loadOutcomes } from './configurationCatalog.js';

/**
 * Whether work of a given activity type can be concluded, asked once for every screen that shows it.
 *
 * An activity is concluded by recording a configured **outcome**, and Legal Recommendation,
 * Deceased Review and Collection Dispute have none configured between them (KI-131). Each of those
 * three has a card on the case, and each would otherwise have to discover that for itself — three
 * implementations of one configuration question, drifting apart the first time one is edited.
 *
 * So the question lives here and the answer comes from the domain's single rule. **There is no
 * process-specific behaviour in this hook**: it takes a type id, reads that type's catalogue, and
 * reports what the domain makes of the count. A card that shows Legal and a card that shows a
 * deceased review get the same sentence for the same reason.
 *
 * **Absence of an answer is not a refusal.** While the catalogue is loading — or if it could not be
 * read — the hook reports `available`, because "we have not asked yet" must never be shown to an
 * officer as "you may not finish this". The write path refuses on its own evidence regardless, so a
 * hopeful UI cannot let anything through.
 */
export function useConcludability(
  adapter: XrmCrmAdapter,
  activityTypeId: string | undefined,
): ConcludeAvailability {
  return concludability(useOutcomeCount(adapter, activityTypeId));
}

/**
 * How many outcomes a type has configured, or `undefined` while unknown or unreadable.
 *
 * Exposed raw for the capability matrix, which must tell *not known* apart from *none* — a
 * distinction `concludability` deliberately folds away for the write path.
 */
export function useOutcomeCount(
  adapter: XrmCrmAdapter,
  activityTypeId: string | undefined,
): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!activityTypeId) {
      setCount(undefined);
      return () => { cancelled = true; };
    }

    // The count is all that is wanted; the rows themselves belong to the dialog that offers them.
    loadOutcomes(adapter, activityTypeId)
      .then(outcomes => { if (!cancelled) setCount(outcomes.length); })
      // A catalogue that could not be read is unknown, never empty. Reporting it as empty would
      // turn a transient failure into "QDB has configured nothing", which is a different claim.
      .catch(() => { if (!cancelled) setCount(undefined); });

    return () => { cancelled = true; };
  }, [adapter, activityTypeId]);

  return count;
}

/**
 * The id of a process's configured activity type, resolved once per adapter.
 *
 * Each advanced-process card resolves its type by code in the same way; a type that could not be
 * resolved is `undefined`, which `useConcludability` reads as "not yet known", never as empty.
 */
export function useActivityTypeId(
  adapter: XrmCrmAdapter,
  findTypeId: (adapter: XrmCrmAdapter) => Promise<string | null | undefined>,
): string | undefined {
  const [typeId, setTypeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    findTypeId(adapter)
      .then(id => { if (!cancelled) setTypeId(id ?? undefined); })
      .catch(() => { if (!cancelled) setTypeId(undefined); });
    return () => { cancelled = true; };
  }, [adapter, findTypeId]);

  return typeId;
}

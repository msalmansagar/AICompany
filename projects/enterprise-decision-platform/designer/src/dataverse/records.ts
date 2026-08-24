// Record search for lookup condition values: find records of a lookup's target
// entity by primary name, so authors pick "Contoso Ltd" instead of pasting a GUID.

import { webApiGet } from './apiBase';

export interface RecordRef { id: string; name: string; }

interface EntityAccess { entitySet: string; primaryId: string; primaryName: string; }

const accessCache = new Map<string, Promise<EntityAccess>>();

function entityAccess(entity: string): Promise<EntityAccess> {
  const cached = accessCache.get(entity);
  if (cached) return cached;
  const pending = webApiGet<any>(
    `/EntityDefinitions(LogicalName='${entity}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`
  ).then((d) => ({ entitySet: d.EntitySetName as string, primaryId: d.PrimaryIdAttribute as string, primaryName: d.PrimaryNameAttribute as string }))
    .catch((e) => { accessCache.delete(entity); throw e; });
  accessCache.set(entity, pending);
  return pending;
}

/** Records of an entity whose primary name contains the term (all records when empty). */
export async function searchRecords(entity: string, term: string, top = 8): Promise<RecordRef[]> {
  const a = await entityAccess(entity);
  const escaped = term.trim().replace(/'/g, "''");
  const filter = escaped ? `&$filter=contains(${a.primaryName},'${encodeURIComponent(escaped)}')` : '';
  const d = await webApiGet<{ value: any[] }>(
    `/${a.entitySet}?$select=${a.primaryId},${a.primaryName}&$orderby=${a.primaryName} asc&$top=${top}${filter}`
  );
  return d.value.map((r) => ({ id: r[a.primaryId] as string, name: (r[a.primaryName] as string) ?? '(no name)' }));
}

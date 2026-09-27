// Reads CRM entity/attribute/option-set metadata via the Web API. Dual-mode:
// CRM (Xrm or *.dynamics.com same-origin) or the local /dataverse dev proxy.

import { apiBase } from '../dataverse/apiBase';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

const label = (l: any, fallback: string) => l?.UserLocalizedLabel?.Label ?? l?.LocalizedLabels?.[0]?.Label ?? fallback;

export interface EntityMeta { logicalName: string; displayName: string; }
export interface AttributeMeta { logicalName: string; displayName: string; type: string; }
export interface OptionMeta { value: number; label: string; }

let entityCache: EntityMeta[] | null = null;

// System tables that are never rule targets are hidden from the picker.
const HIDDEN_ENTITY_PREFIXES = ['msdyn_', 'msdyncrm_', 'msdynmkt_', 'adx_', 'mspp_', 'flow', 'bookableresource'];

/** All entities (cached), filtered client-side — EntityDefinitions doesn't support startswith. */
export async function searchEntities(term: string): Promise<EntityMeta[]> {
  if (!entityCache) {
    const d = await get<{ value: any[] }>(`/EntityDefinitions?$select=LogicalName,DisplayName`);
    entityCache = d.value
      .map((e) => ({ logicalName: e.LogicalName as string, displayName: label(e.DisplayName, e.LogicalName) }))
      .filter((e) => !HIDDEN_ENTITY_PREFIXES.some((p) => e.logicalName.startsWith(p)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  const t = term.trim().toLowerCase();
  if (!t) return entityCache; // full set — the combobox caps display and searches all
  return entityCache.filter((e) => e.logicalName.toLowerCase().includes(t) || e.displayName.toLowerCase().includes(t));
}

// Attribute metadata is immutable within a session and requested by several surfaces
// (table editor, canvas schema, aggregates) — cache the in-flight promise per entity.
const attributeCache = new Map<string, Promise<AttributeMeta[]>>();

/** Non-virtual attributes of an entity, sorted by display name. Cached per entity. */
export function listAttributes(entity: string): Promise<AttributeMeta[]> {
  const cached = attributeCache.get(entity);
  if (cached) return cached;
  const pending = fetchAttributes(entity).catch((e) => { attributeCache.delete(entity); throw e; });
  attributeCache.set(entity, pending);
  return pending;
}

// Multi-select picklists report AttributeType 'Virtual'; only AttributeTypeName tells them
// apart from genuinely virtual columns, so they need a type of their own here.
const isMultiSelect = (a: any) => a.AttributeTypeName?.Value === 'MultiSelectPicklistType';

async function fetchAttributes(entity: string): Promise<AttributeMeta[]> {
  const d = await get<{ value: any[] }>(
    `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,DisplayName,AttributeType,AttributeTypeName`
  );
  return d.value
    .filter((a) => a.AttributeType && (a.AttributeType !== 'Virtual' || isMultiSelect(a)))
    .map((a) => ({
      logicalName: a.LogicalName as string,
      displayName: label(a.DisplayName, a.LogicalName),
      type: isMultiSelect(a) ? 'MultiSelectPicklist' : (a.AttributeType as string),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export interface RelationshipMeta { relationship: string; displayName: string; targetEntity: string; }

// Ownership/audit lookups are almost never a rule's data source — keep the picker business-focused.
const SYSTEM_LOOKUPS = new Set([
  'ownerid', 'owningbusinessunit', 'owningteam', 'owninguser',
  'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby',
]);

export interface ChildRelationshipMeta { childEntity: string; childLookup: string; displayName: string; }

// System child collections that are never a business aggregation source.
const SYSTEM_CHILD = new Set([
  'annotation', 'activitypointer', 'asyncoperation', 'bulkdeletefailure', 'duplicaterecord',
  'principalobjectattributeaccess', 'processsession', 'syncerror', 'userentityinstancedata',
  'activityparty', 'annotationbase', 'sharepointdocumentlocation', 'connection', 'audit',
]);

/** 1:N child collections of an entity → the child entity + the lookup on it that points back. */
export async function listChildRelationships(entity: string): Promise<ChildRelationshipMeta[]> {
  const d = await get<{ value: any[] }>(
    `/EntityDefinitions(LogicalName='${entity}')/OneToManyRelationships?$select=ReferencingEntity,ReferencingAttribute`
  );
  const nameOf = (ln: string) => entityCache?.find((e) => e.logicalName === ln)?.displayName ?? ln;
  const seen = new Set<string>();
  return d.value
    .filter((r) => r.ReferencingEntity && r.ReferencingAttribute
      && !SYSTEM_CHILD.has(r.ReferencingEntity)
      && !HIDDEN_ENTITY_PREFIXES.some((p) => (r.ReferencingEntity as string).startsWith(p)))
    .map((r) => ({ childEntity: r.ReferencingEntity as string, childLookup: r.ReferencingAttribute as string, displayName: nameOf(r.ReferencingEntity) }))
    .filter((r) => { const k = `${r.childEntity}|${r.childLookup}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** N:1 lookups on an entity → the related (parent) entity they point to, sorted by display name. */
export async function listRelationships(entity: string): Promise<RelationshipMeta[]> {
  const d = await get<{ value: any[] }>(
    `/EntityDefinitions(LogicalName='${entity}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,DisplayName,Targets`
  );
  return d.value
    .filter((a) => Array.isArray(a.Targets) && a.Targets.length > 0 && !SYSTEM_LOOKUPS.has(a.LogicalName))
    .map((a) => ({ relationship: a.LogicalName as string, displayName: label(a.DisplayName, a.LogicalName), targetEntity: a.Targets[0] as string }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Option-set members for a Picklist/State/Status/MultiSelectPicklist attribute. */
export async function listOptions(entity: string, attribute: string, crmType?: string): Promise<OptionMeta[]> {
  const cast = crmType === 'MultiSelectPicklist' ? 'MultiSelectPicklistAttributeMetadata' : 'PicklistAttributeMetadata';
  const path = `/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')`
    + `/Microsoft.Dynamics.CRM.${cast}?$select=LogicalName&$expand=OptionSet`;
  try {
    const d = await get<any>(path);
    const opts = d?.OptionSet?.Options ?? [];
    return opts.map((o: any) => ({ value: o.Value as number, label: label(o.Label, String(o.Value)) }));
  } catch {
    return [];
  }
}

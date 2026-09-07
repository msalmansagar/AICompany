import type { ICrmAdapter, AttributeMeta } from './ICrmAdapter';

const OPERATOR_MAP: Record<string, string> = {
  eq: '=',
  ne: '≠',
  lt: '<',
  le: '≤',
  gt: '>',
  ge: '≥',
  like: 'contains',
  'not-like': 'not contains',
  null: 'is empty',
  'not-null': 'is not empty',
  in: 'in',
  'not-in': 'not in',
  'begins-with': 'starts with',
  'not-begin-with': 'does not start with',
  'ends-with': 'ends with',
  'not-end-with': 'does not end with',
};

const OPTIONSET_TYPES = new Set(['Picklist', 'Status', 'State', 'MultiSelectPicklist', 'Virtual']);
const NUMERIC_TYPES = new Set(['Integer', 'BigInt', 'Decimal', 'Double', 'Money']);
const LOOKUP_TYPES = new Set(['Lookup', 'Owner', 'Customer']);
const NULL_OPERATORS = new Set(['null', 'not-null']);
const GUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

// Session-scoped promise caches — deduplicate in-flight requests and persist results
const attrsByEntityCache = new Map<string, Promise<AttributeMeta[]>>();
const optionsByAttrCache = new Map<string, Promise<Map<number, string>>>();
const lookupNameCache = new Map<string, Promise<string | null>>();

export interface ResolvedCondition {
  fieldLabel: string;
  operatorLabel: string;
  valueLabel: string | null;
}

export interface ResolvedRouteFilter {
  conditions: ResolvedCondition[];
}

export async function resolveRouteFilter(
  fetchXml: string,
  adapter: ICrmAdapter
): Promise<ResolvedRouteFilter | null> {
  if (!fetchXml?.trim()) return null;
  try {
    const doc = new DOMParser().parseFromString(fetchXml.trim(), 'text/xml');
    if (doc.querySelector('parsererror')) return null;

    const entityEl = doc.querySelector('entity');
    if (!entityEl) return null;
    const entityLogicalName = entityEl.getAttribute('name') ?? '';

    const condEls = Array.from(doc.querySelectorAll('condition'));
    if (condEls.length === 0) return null;

    const conditions = await Promise.all(
      // A condition inside a <link-entity> belongs to THAT entity, not the
      // fetch root — resolving qdb_approval_authority against qdb_task found
      // no metadata, so the panel showed "751090002" instead of "CEO".
      condEls.map((c) => resolveCondition(c, owningEntityOf(c, entityLogicalName), adapter))
    );

    return { conditions };
  } catch {
    return null;
  }
}

/** The entity a condition actually filters: its nearest link-entity, else the root. */
function owningEntityOf(conditionEl: Element, rootEntity: string): string {
  const holder = conditionEl.closest('link-entity, entity');
  return holder?.getAttribute('name') || rootEntity;
}

function fetchEntityAttrs(entityLogicalName: string, adapter: ICrmAdapter): Promise<AttributeMeta[]> {
  if (!attrsByEntityCache.has(entityLogicalName)) {
    attrsByEntityCache.set(
      entityLogicalName,
      adapter.getAttributesMeta(entityLogicalName).catch(() => [])
    );
  }
  return attrsByEntityCache.get(entityLogicalName)!;
}

function fetchOptionLabels(
  entityLogicalName: string,
  attributeLogicalName: string,
  adapter: ICrmAdapter
): Promise<Map<number, string>> {
  const key = `${entityLogicalName}:${attributeLogicalName}`;
  if (!optionsByAttrCache.has(key)) {
    optionsByAttrCache.set(
      key,
      adapter.getOptionSetLabels(entityLogicalName, attributeLogicalName).catch(() => new Map())
    );
  }
  return optionsByAttrCache.get(key)!;
}

async function resolveCondition(
  el: Element,
  entityLogicalName: string,
  adapter: ICrmAdapter
): Promise<ResolvedCondition> {
  const attrLogicalName = el.getAttribute('attribute') ?? '';
  const operator = el.getAttribute('operator') ?? 'eq';
  const rawValue = el.getAttribute('value');

  const operatorLabel = OPERATOR_MAP[operator] ?? operator;
  const isNullCheck = NULL_OPERATORS.has(operator);

  const attrs = await fetchEntityAttrs(entityLogicalName, adapter);
  const meta = attrs.find((a) => a.logicalName === attrLogicalName);
  const fieldLabel = meta?.displayName ?? attrLogicalName;
  const attrType = meta?.attributeType ?? 'String';

  if (isNullCheck || rawValue === null) {
    return { fieldLabel, operatorLabel, valueLabel: null };
  }

  let valueLabel = rawValue;

  if (OPTIONSET_TYPES.has(attrType)) {
    const numVal = parseInt(rawValue, 10);
    if (!isNaN(numVal)) {
      const optMap = await fetchOptionLabels(entityLogicalName, attrLogicalName, adapter);
      valueLabel = optMap.get(numVal) ?? rawValue;
    }
  } else if (NUMERIC_TYPES.has(attrType)) {
    const num = parseFloat(rawValue);
    if (!isNaN(num)) valueLabel = num.toLocaleString();
  } else if (LOOKUP_TYPES.has(attrType) && GUID_PATTERN.test(rawValue)) {
    // A GUID names nothing to a reader. Designer-authored filters carry the
    // record's name in uiname; API-authored ones don't, so the name is read
    // from the record itself, with the raw GUID as the honest fallback.
    const uiname = el.getAttribute('uiname');
    valueLabel = uiname?.trim()
      ? uiname
      : (await fetchLookupName(entityLogicalName, attrLogicalName, rawValue, adapter)) ?? rawValue;
  }

  return { fieldLabel, operatorLabel, valueLabel };
}

function fetchLookupName(
  entityLogicalName: string,
  attributeLogicalName: string,
  recordId: string,
  adapter: ICrmAdapter
): Promise<string | null> {
  const key = `${entityLogicalName}:${attributeLogicalName}:${recordId.replace(/[{}]/g, '').toLowerCase()}`;
  if (!lookupNameCache.has(key)) {
    lookupNameCache.set(
      key,
      adapter.getLookupValueName(entityLogicalName, attributeLogicalName, recordId).catch(() => null)
    );
  }
  return lookupNameCache.get(key)!;
}

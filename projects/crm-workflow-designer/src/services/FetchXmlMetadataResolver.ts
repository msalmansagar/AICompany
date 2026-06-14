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
const NULL_OPERATORS = new Set(['null', 'not-null']);

// Session-scoped promise caches — deduplicate in-flight requests and persist results
const attrsByEntityCache = new Map<string, Promise<AttributeMeta[]>>();
const optionsByAttrCache = new Map<string, Promise<Map<number, string>>>();

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
      condEls.map((c) => resolveCondition(c, entityLogicalName, adapter))
    );

    return { conditions };
  } catch {
    return null;
  }
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
  }

  return { fieldLabel, operatorLabel, valueLabel };
}

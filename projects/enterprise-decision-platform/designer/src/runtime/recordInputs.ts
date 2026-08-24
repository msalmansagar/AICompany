// Fills a rule's test inputs from a REAL record of the target entity, so authors
// test against production-shaped data instead of hand-typing every value:
// anchor bindings read the row, via bindings follow the lookup to the parent row,
// aggregates are computed from the child collection (capped at 5000 rows).

import { webApiGet } from '../dataverse/apiBase';
import { entityAccess } from '../dataverse/records';

interface AggFilter { field: string; operator: string; value: unknown; }
interface PcrmInput {
  name: string;
  binding?: string;
  via?: { relationship: string; entity: string };
  aggregate?: { function: string; childEntity: string; childLookup: string; filter?: AggFilter };
}

/** A row column by binding name — lookups come back as `_binding_value`. */
export function columnValue(row: Record<string, unknown>, binding: string): unknown {
  const v = row[binding] !== undefined ? row[binding] : row[`_${binding}_value`];
  return v === undefined ? null : v;
}

/** Client-side aggregate over child rows — mirrors the runtime's Count/Sum/Avg/Min/Max. */
export function computeAggregate(rows: Record<string, unknown>[], fn: string, binding: string, filter?: AggFilter): number | null {
  const kept = filter?.field ? rows.filter((r) => passesFilter(columnValue(r, filter.field), filter.operator, filter.value)) : rows;
  if (fn === 'Count') return kept.length;
  const nums = kept.map((r) => Number(columnValue(r, binding))).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return fn === 'Sum' ? 0 : null;
  switch (fn) {
    case 'Sum': return nums.reduce((a, b) => a + b, 0);
    case 'Avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'Min': return Math.min(...nums);
    case 'Max': return Math.max(...nums);
    default: return null;
  }
}

export function passesFilter(left: unknown, operator: string, right: unknown): boolean {
  const ln = Number(left); const rn = Number(right);
  const numeric = Number.isFinite(ln) && Number.isFinite(rn);
  switch (operator) {
    case 'Equals': return numeric ? ln === rn : String(left ?? '') === String(right ?? '');
    case 'NotEquals': return numeric ? ln !== rn : String(left ?? '') !== String(right ?? '');
    case 'GreaterThan': return numeric && ln > rn;
    case 'GreaterThanOrEqual': return numeric && ln >= rn;
    case 'LessThan': return numeric && ln < rn;
    case 'LessThanOrEqual': return numeric && ln <= rn;
    default: return false;
  }
}

async function fetchRow(entity: string, id: string): Promise<Record<string, unknown>> {
  const a = await entityAccess(entity);
  return webApiGet<Record<string, unknown>>(`/${a.entitySet}(${id})`);
}

async function viaValue(input: PcrmInput, anchor: Record<string, unknown>, parents: Map<string, Promise<Record<string, unknown> | null>>): Promise<unknown> {
  const via = input.via!;
  const parentId = (anchor[`_${via.relationship}_value`] ?? anchor[via.relationship]) as string | null | undefined;
  if (!parentId || !via.entity) return null;
  const key = `${via.entity}:${parentId}`;
  if (!parents.has(key)) parents.set(key, fetchRow(via.entity, parentId).catch(() => null));
  const row = await parents.get(key)!;
  return row && input.binding ? columnValue(row, input.binding) : null;
}

async function aggregateValue(input: PcrmInput, recordId: string): Promise<unknown> {
  const agg = input.aggregate!;
  const a = await entityAccess(agg.childEntity);
  const d = await webApiGet<{ value: Record<string, unknown>[] }>(
    `/${a.entitySet}?$filter=_${agg.childLookup}_value eq ${recordId}&$top=5000`
  );
  return computeAggregate(d.value, agg.function, input.binding ?? '', agg.filter);
}

/** Test inputs for a PCRM, resolved from one record of its target entity. */
export async function inputsFromRecord(pcrm: any, recordId: string): Promise<Record<string, unknown>> {
  const inputs: PcrmInput[] = pcrm?.inputs ?? [];
  const anchor = await fetchRow(pcrm.targetEntity, recordId);
  const parents = new Map<string, Promise<Record<string, unknown> | null>>();
  const out: Record<string, unknown> = {};
  for (const input of inputs) {
    if (input.aggregate) out[input.name] = await aggregateValue(input, recordId);
    else if (input.via) out[input.name] = await viaValue(input, anchor, parents);
    else if (input.binding) out[input.name] = columnValue(anchor, input.binding);
  }
  return out;
}

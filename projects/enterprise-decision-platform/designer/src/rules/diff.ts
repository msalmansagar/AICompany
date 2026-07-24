// Structural diff between two rule versions, computed over their canonical PCRM (so it works for
// both decision-table and canvas rules). Pure — no I/O — and unit-tested.

export interface FieldChange { field: string; from: string; to: string; }
export interface ListDiff { added: string[]; removed: string[]; changed: FieldChange[]; }
export interface RowChange { index: number; kind: 'added' | 'removed' | 'changed'; details: string[]; }
export interface PcrmDiff {
  meta: FieldChange[];
  inputs: ListDiff;
  outputs: ListDiff;
  rows: RowChange[];
  identical: boolean;
}

type Any = Record<string, any>;

const s = (v: unknown): string => (v == null ? '' : String(v));

/** name → type map from an inputs/outputs array. */
function typeMap(arr: any[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of arr ?? []) if (x?.name) m.set(String(x.name), s(x.type));
  return m;
}

function listDiff(a: Map<string, string>, b: Map<string, string>): ListDiff {
  const added: string[] = [], removed: string[] = [], changed: FieldChange[] = [];
  for (const [k, tb] of b) if (!a.has(k)) added.push(k);
  for (const [k, ta] of a) {
    if (!b.has(k)) { removed.push(k); continue; }
    const tb = b.get(k)!;
    if (ta !== tb) changed.push({ field: k, from: ta, to: tb });
  }
  return { added: added.sort(), removed: removed.sort(), changed };
}

/** A readable token per cell: "any", or "operator value", or a field reference. */
function cellToken(cell: Any): string {
  if (!cell || cell.any || cell.operator === 'Any' || !cell.operator) return 'any';
  const rhs = cell.valueField ? `[${cell.valueField}]` : s(cell.value);
  const rhs2 = cell.value2Field ? `[${cell.value2Field}]` : cell.value2 != null ? s(cell.value2) : '';
  return `${cell.operator} ${rhs}${rhs2 ? '..' + rhs2 : ''}`.trim();
}

function rowSummary(row: Any) {
  return {
    cells: (row?.cells ?? []).map(cellToken),
    outputs: (row?.outputs ?? {}) as Record<string, unknown>,
    reasonCodes: (row?.reasonCodes ?? []) as string[],
  };
}

function diffRow(index: number, a: Any, b: Any): RowChange | null {
  const ra = rowSummary(a), rb = rowSummary(b);
  const details: string[] = [];

  const maxCells = Math.max(ra.cells.length, rb.cells.length);
  for (let i = 0; i < maxCells; i++) {
    const ca = ra.cells[i] ?? '—', cb = rb.cells[i] ?? '—';
    if (ca !== cb) details.push(`condition ${i + 1}: ${ca} → ${cb}`);
  }
  const keys = new Set([...Object.keys(ra.outputs), ...Object.keys(rb.outputs)]);
  for (const k of keys) {
    const va = s(ra.outputs[k]), vb = s(rb.outputs[k]);
    if (va !== vb) details.push(`output ${k}: ${va || '—'} → ${vb || '—'}`);
  }
  const codesA = ra.reasonCodes.join(', '), codesB = rb.reasonCodes.join(', ');
  if (codesA !== codesB) details.push(`reason codes: ${codesA || '—'} → ${codesB || '—'}`);

  return details.length ? { index: index + 1, kind: 'changed', details } : null;
}

export function diffPcrm(a: Any, b: Any): PcrmDiff {
  const la = a?.logic ?? {}, lb = b?.logic ?? {};

  const meta: FieldChange[] = [];
  const metaField = (field: string, va: unknown, vb: unknown) => { if (s(va) !== s(vb)) meta.push({ field, from: s(va), to: s(vb) }); };
  metaField('name', a?.name, b?.name);
  metaField('target entity', a?.targetEntity, b?.targetEntity);
  metaField('logic type', la.type, lb.type);
  metaField('hit policy', la.hitPolicy, lb.hitPolicy);

  const inputs = listDiff(typeMap(a?.inputs), typeMap(b?.inputs));
  const outputs = listDiff(typeMap(a?.outputs), typeMap(b?.outputs));

  const rowsA: Any[] = la.rows ?? [], rowsB: Any[] = lb.rows ?? [];
  const rows: RowChange[] = [];
  const maxRows = Math.max(rowsA.length, rowsB.length);
  for (let i = 0; i < maxRows; i++) {
    if (i >= rowsA.length) { rows.push({ index: i + 1, kind: 'added', details: [`+ row ${i + 1}`] }); continue; }
    if (i >= rowsB.length) { rows.push({ index: i + 1, kind: 'removed', details: [`− row ${i + 1}`] }); continue; }
    const changed = diffRow(i, rowsA[i], rowsB[i]);
    if (changed) rows.push(changed);
  }

  const identical = meta.length === 0 && inputs.added.length === 0 && inputs.removed.length === 0 &&
    inputs.changed.length === 0 && outputs.added.length === 0 && outputs.removed.length === 0 &&
    outputs.changed.length === 0 && rows.length === 0;

  return { meta, inputs, outputs, rows, identical };
}

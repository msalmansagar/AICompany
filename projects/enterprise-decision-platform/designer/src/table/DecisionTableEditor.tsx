import { useEffect, useState } from 'react';
import { listAttributes, listOptions, listRelationships, type AttributeMeta, type OptionMeta, type RelationshipMeta } from '../metadata/metadataService';
import {
  type TableModel, type Row, type Cell, HIT_POLICIES, operatorsFor, arity, category, newRow,
} from './tableModel';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Option-set cache key — namespaced by source entity so a related field can't collide with an anchor field of the same name.
const optKey = (viaEntity: string | undefined, field: string) => `${viaEntity ?? '_anchor'}|${field}`;

/**
 * Metadata-bound decision table, laid out like the GoRules decision table so the two
 * authoring surfaces feel like one product: grouped "When / Then" colored header bands,
 * a hit-policy corner, inline add-column, numbered rows. The difference is the cells —
 * here you pick CRM fields and operators (no expression typing).
 */
export function DecisionTableEditor({ entity, value, onChange }: { entity: string; value: TableModel; onChange: (m: TableModel) => void }) {
  const [attrs, setAttrs] = useState<AttributeMeta[]>([]);
  const [rels, setRels] = useState<RelationshipMeta[]>([]);
  const [relAttrs, setRelAttrs] = useState<Record<string, AttributeMeta[]>>({});
  const [options, setOptions] = useState<Record<string, OptionMeta[]>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!entity) return;
    setErr(''); setRelAttrs({});
    listAttributes(entity).then(setAttrs).catch((e) => setErr('Could not load fields: ' + e.message));
    listRelationships(entity).then(setRels).catch(() => setRels([]));
  }, [entity]);

  // Load related fields for any column already bound to a relationship (e.g. when a rule opens).
  useEffect(() => {
    value.inputs.forEach((i) => { if (i.via) void ensureRelAttrs(i.via.relationship, i.via.entity); });
  }, [value.inputs]); // eslint-disable-line

  useEffect(() => {
    value.inputs.forEach((i) => {
      const src = i.via?.entity ?? entity;
      const k = optKey(i.via?.entity, i.field);
      if (category(i.type) === 'optionset' && i.field && !options[k] && src) {
        listOptions(src, i.field).then((o) => setOptions((prev) => ({ ...prev, [k]: o }))).catch(() => {});
      }
    });
  }, [value.inputs, entity]); // eslint-disable-line

  const set = (m: TableModel) => onChange(m);
  const fieldsFor = (col: TableModel['inputs'][number]) => (col.via ? relAttrs[col.via.relationship] ?? [] : attrs);

  async function ensureRelAttrs(relationship: string, relatedEntity: string) {
    if (relAttrs[relationship] || !relatedEntity) return;
    try { const a = await listAttributes(relatedEntity); setRelAttrs((prev) => ({ ...prev, [relationship]: a })); } catch { /* surfaced on pick */ }
  }

  function addInput() { const m = clone(value); m.inputs.push({ field: '', label: '', type: 'String' }); m.rows.forEach((r) => r.cells.push({ any: true })); set(m); }
  function removeInput(ci: number) { const m = clone(value); m.inputs.splice(ci, 1); m.rows.forEach((r) => r.cells.splice(ci, 1)); set(m); }

  /** Switch a column between the anchor table ("") and a related table (a lookup). Resets the field. */
  function setSource(ci: number, relationship: string) {
    const m = clone(value); const col = m.inputs[ci];
    if (!relationship) { delete col.via; }
    else {
      const rel = rels.find((r) => r.relationship === relationship);
      if (rel) { col.via = { relationship: rel.relationship, entity: rel.targetEntity, relLabel: rel.displayName }; void ensureRelAttrs(rel.relationship, rel.targetEntity); }
    }
    col.field = ''; col.label = ''; col.type = 'String';
    m.rows.forEach((r) => (r.cells[ci] = { any: true }));
    set(m);
  }

  function setInputField(ci: number, field: string) {
    const col = value.inputs[ci];
    const a = fieldsFor(col).find((x) => x.logicalName === field);
    const m = clone(value);
    m.inputs[ci] = { ...col, field, label: a?.displayName ?? field, type: a?.type ?? 'String' };
    m.rows.forEach((r) => (r.cells[ci] = { any: true }));
    set(m);
  }
  function addOutput() { const m = clone(value); m.outputs.push({ name: `out${m.outputs.length + 1}`, type: 'Text' }); set(m); }
  function removeOutput(oi: number) { const m = clone(value); const name = m.outputs[oi].name; m.outputs.splice(oi, 1); m.rows.forEach((r) => delete r.outputs[name]); set(m); }
  function setOutput(oi: number, patch: Partial<TableModel['outputs'][number]>) { const m = clone(value); m.outputs[oi] = { ...m.outputs[oi], ...patch }; set(m); }
  function addRow() { const m = clone(value); m.rows.push(newRow(m.inputs.length, m.outputs.length)); set(m); }
  function dupRow(ri: number) { const m = clone(value); m.rows.splice(ri + 1, 0, clone(m.rows[ri])); set(m); }
  function removeRow(ri: number) { const m = clone(value); m.rows.splice(ri, 1); set(m); }
  function setCell(ri: number, ci: number, patch: Partial<Cell>) { const m = clone(value); m.rows[ri].cells[ci] = { ...m.rows[ri].cells[ci], ...patch }; set(m); }
  function setRowOut(ri: number, name: string, v: string) { const m = clone(value); m.rows[ri].outputs[name] = v; set(m); }

  const nIn = value.inputs.length;
  const nOut = value.outputs.length;

  return (
    <div className="dt2">
      {!entity && <p className="dt2-hint">Choose the table this rule runs on to pick fields in each condition.</p>}
      {err && <p className="dt2-hint dt2-err">{err}</p>}

      <div className="dt2-scroll">
        <table className="dt2-table">
          <thead>
            <tr>
              <th className="dt2-corner" rowSpan={2} title="Hit policy — how multiple matching rows resolve">
                <select value={value.hitPolicy} onChange={(e) => set({ ...value, hitPolicy: e.target.value as TableModel['hitPolicy'] })}>
                  {HIT_POLICIES.map((h) => <option key={h}>{h}</option>)}
                </select>
              </th>
              <th className="dt2-band dt2-band-in" colSpan={nIn + 1}>When — conditions</th>
              <th className="dt2-band dt2-band-out" colSpan={nOut + 1}>Then — outcome</th>
              <th className="dt2-band-x" rowSpan={2} />
            </tr>
            <tr>
              {value.inputs.map((col, ci) => (
                <th key={ci} className="dt2-col dt2-col-in">
                  <div className="dt2-col-top">
                    <div className="dt2-field-pick">
                      {rels.length > 0 && (
                        <select className="dt2-src" value={col.via?.relationship ?? ''} title="Read from this table or a related (parent) table"
                          onChange={(e) => setSource(ci, e.target.value)}>
                          <option value="">This table</option>
                          {rels.map((r) => <option key={r.relationship} value={r.relationship}>{r.displayName}</option>)}
                        </select>
                      )}
                      <select value={col.field} onChange={(e) => setInputField(ci, e.target.value)}>
                        <option value="">— pick field —</option>
                        {fieldsFor(col).map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>)}
                      </select>
                    </div>
                    <button className="dt2-col-x" title="Remove column" onClick={() => removeInput(ci)}>✕</button>
                  </div>
                  {col.field && <span className="dt2-col-type">{col.via ? `${col.via.relLabel} › ` : ''}{col.type}</span>}
                </th>
              ))}
              <th className="dt2-addcol"><button title="Add condition column" onClick={addInput}>+</button></th>

              {value.outputs.map((o, oi) => (
                <th key={'o' + oi} className="dt2-col dt2-col-out">
                  <div className="dt2-col-top">
                    <input value={o.name} onChange={(e) => setOutput(oi, { name: e.target.value })} placeholder="output" />
                    <button className="dt2-col-x" title="Remove column" onClick={() => removeOutput(oi)}>✕</button>
                  </div>
                  <select className="dt2-col-typesel" value={o.type} onChange={(e) => setOutput(oi, { type: e.target.value as any })}>
                    <option>Text</option><option>Number</option><option>Boolean</option>
                  </select>
                </th>
              ))}
              <th className="dt2-addcol"><button title="Add outcome column" onClick={addOutput}>+</button></th>
            </tr>
          </thead>
          <tbody>
            {value.rows.length === 0 && (
              <tr><td className="dt2-emptyrow" colSpan={nIn + nOut + 4}>No rules yet — add a row below.</td></tr>
            )}
            {value.rows.map((row, ri) => (
              <tr key={ri} className="dt2-row">
                <td className="dt2-rownum">{ri + 1}</td>
                {value.inputs.map((col, ci) => <td key={ci} className="dt2-cell dt2-cell-in">{renderCell(ri, row, ci, col, options)}</td>)}
                <td className="dt2-gap" />
                {value.outputs.map((o, oi) => <td key={'o' + oi} className="dt2-cell dt2-cell-out">{renderOutput(o, row.outputs[o.name] ?? '', (v) => setRowOut(ri, o.name, v))}</td>)}
                <td className="dt2-gap" />
                <td className="dt2-rowact">
                  <button onClick={() => dupRow(ri)} title="Duplicate row">⧉</button>
                  <button onClick={() => removeRow(ri)} title="Delete row">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="dt2-addrow" onClick={addRow}><span>+</span> Add rule row</button>
      </div>
    </div>
  );

  function renderCell(rowIdx: number, row: Row, ci: number, col: TableModel['inputs'][number], opts: Record<string, OptionMeta[]>) {
    const cat = col.field ? category(col.type) : 'text';
    const cell = row.cells[ci] ?? { any: true };
    const op = cell.any ? 'Any' : (cell.operator ?? 'Any');
    const n = arity(cat, op);
    const patch = (p: Partial<Cell>) => setCell(rowIdx, ci, p);
    const isField = cell.valueField !== undefined;
    const cellOpts = opts[optKey(col.via?.entity, col.field)];
    // Field-to-field is anchor-only for now (cross-table comparison deferred), so related
    // columns compare against a value only.
    const allowFieldMode = n >= 1 && col.field && !col.via;
    return (
      <div className="dt2-cellbox">
        <select className="dt2-op" value={op} disabled={!col.field}
          onChange={(e) => patch(e.target.value === 'Any' ? { any: true, operator: undefined } : { any: false, operator: e.target.value })}>
          {operatorsFor(cat).map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        {allowFieldMode && (
          <select className="dt2-rhsmode" value={isField ? 'field' : 'value'} title="Compare against a fixed value or another field on the record"
            onChange={(e) => patch(e.target.value === 'field' ? { valueField: '', value: undefined } : { valueField: undefined })}>
            <option value="value">value</option>
            <option value="field">field</option>
          </select>
        )}
        {n >= 1 && col.field && (
          isField && allowFieldMode
            ? <select className="dt2-fieldsel" value={cell.valueField ?? ''} onChange={(e) => patch({ valueField: e.target.value })}>
                <option value="">— pick field —</option>
                {attrs.filter((a) => a.logicalName !== col.field).map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>)}
              </select>
            : valueEditor(cat, cellOpts, cell.value ?? '', (v) => patch({ value: v }))
        )}
        {n === 2 && <span className="dt2-and">and</span>}
        {n === 2 && valueEditor(cat, cellOpts, cell.value2 ?? '', (v) => patch({ value2: v }))}
      </div>
    );
  }
}

function valueEditor(cat: string, opts: OptionMeta[] | undefined, val: string, onChange: (v: string) => void) {
  if (cat === 'boolean') return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (cat === 'optionset' && opts?.length) return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if (cat === 'number') return <input type="number" value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
  if (cat === 'date') return <input type="date" value={val} onChange={(e) => onChange(e.target.value)} />;
  return <input value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
}

function renderOutput(o: TableModel['outputs'][number], val: string, onChange: (v: string) => void) {
  if (o.type === 'Boolean') return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (o.type === 'Number') return <input type="number" value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
  return <input value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
}

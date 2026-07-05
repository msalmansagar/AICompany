import { useEffect, useState } from 'react';
import { listAttributes, listOptions, type AttributeMeta, type OptionMeta } from '../metadata/metadataService';
import {
  type TableModel, type Row, type Cell, HIT_POLICIES, operatorsFor, arity, category, newRow,
} from './tableModel';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function DecisionTableEditor({ entity, value, onChange }: { entity: string; value: TableModel; onChange: (m: TableModel) => void }) {
  const [attrs, setAttrs] = useState<AttributeMeta[]>([]);
  const [options, setOptions] = useState<Record<string, OptionMeta[]>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!entity) return;
    listAttributes(entity).then(setAttrs).catch((e) => setErr('Metadata: ' + e.message));
  }, [entity]);

  // lazily load option-set members for optionset input columns
  useEffect(() => {
    value.inputs.forEach((i) => {
      if (category(i.type) === 'optionset' && !options[i.field] && entity) {
        listOptions(entity, i.field).then((o) => setOptions((prev) => ({ ...prev, [i.field]: o }))).catch(() => {});
      }
    });
  }, [value.inputs, entity]); // eslint-disable-line

  const set = (m: TableModel) => onChange(m);
  const attrOf = (f: string) => attrs.find((a) => a.logicalName === f);

  function addInput() {
    const m = clone(value);
    m.inputs.push({ field: '', label: '', type: 'String' });
    m.rows.forEach((r) => r.cells.push({ any: true }));
    set(m);
  }
  function removeInput(ci: number) { const m = clone(value); m.inputs.splice(ci, 1); m.rows.forEach((r) => r.cells.splice(ci, 1)); set(m); }
  function setInputField(ci: number, field: string) {
    const a = attrOf(field); const m = clone(value);
    m.inputs[ci] = { field, label: a?.displayName ?? field, type: a?.type ?? 'String' };
    m.rows.forEach((r) => (r.cells[ci] = { any: true })); // reset cells when column field changes
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

  return (
    <div className="dte">
      <div className="dte-toolbar">
        <label>Hit policy</label>
        <select value={value.hitPolicy} onChange={(e) => set({ ...value, hitPolicy: e.target.value as TableModel['hitPolicy'] })}>
          {HIT_POLICIES.map((h) => <option key={h}>{h}</option>)}
        </select>
        <span className="spacer" />
        <button onClick={addInput}>+ Input column</button>
        <button onClick={addOutput}>+ Output column</button>
        <button onClick={addRow}>+ Row</button>
      </div>
      {err && <p className="tp-error">{err}</p>}
      {!entity && <p className="tp-sub">Set the target Entity in the top bar to pick fields.</p>}

      <div className="dte-scroll">
        <table className="dte-table">
          <thead>
            <tr>
              {value.inputs.map((col, ci) => (
                <th key={ci} className="dte-in">
                  <select value={col.field} onChange={(e) => setInputField(ci, e.target.value)}>
                    <option value="">— pick field —</option>
                    {attrs.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName} [{a.type}]</option>)}
                  </select>
                  <button className="dte-x" title="remove column" onClick={() => removeInput(ci)}>✕</button>
                </th>
              ))}
              {value.outputs.map((o, oi) => (
                <th key={'o' + oi} className="dte-out">
                  <input value={o.name} onChange={(e) => setOutput(oi, { name: e.target.value })} />
                  <select value={o.type} onChange={(e) => setOutput(oi, { type: e.target.value as any })}>
                    <option>Text</option><option>Number</option><option>Boolean</option>
                  </select>
                  <button className="dte-x" onClick={() => removeOutput(oi)}>✕</button>
                </th>
              ))}
              <th className="dte-actions">·</th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, ri) => (
              <tr key={ri}>
                {value.inputs.map((col, ci) => (
                  <td key={ci}>{renderCell(ri, row, ci, col, options)}</td>
                ))}
                {value.outputs.map((o, oi) => (
                  <td key={'o' + oi}>{renderOutput(o, row.outputs[o.name] ?? '', (v) => setRowOut(ri, o.name, v))}</td>
                ))}
                <td className="dte-actions">
                  <button onClick={() => dupRow(ri)} title="duplicate">⧉</button>
                  <button onClick={() => removeRow(ri)} title="delete">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function renderCell(rowIdx: number, row: Row, ci: number, col: TableModel['inputs'][number], opts: Record<string, OptionMeta[]>) {
    const cat = col.field ? category(col.type) : 'text';
    const cell = row.cells[ci] ?? { any: true };
    const op = cell.any ? 'Any' : (cell.operator ?? 'Any');
    const n = arity(cat, op);
    const patch = (p: Partial<Cell>) => setCell(rowIdx, ci, p);
    return (
      <div className="dte-cell">
        <select value={op} disabled={!col.field}
                onChange={(e) => patch(e.target.value === 'Any' ? { any: true, operator: undefined } : { any: false, operator: e.target.value })}>
          {operatorsFor(cat).map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        {n >= 1 && valueEditor(cat, opts[col.field], cell.value ?? '', (v) => patch({ value: v }))}
        {n === 2 && <span className="dte-and">and</span>}
        {n === 2 && valueEditor(cat, opts[col.field], cell.value2 ?? '', (v) => patch({ value2: v }))}
      </div>
    );
  }
}

function valueEditor(cat: string, opts: OptionMeta[] | undefined, val: string, onChange: (v: string) => void) {
  if (cat === 'boolean') return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (cat === 'optionset' && opts?.length) return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if (cat === 'number') return <input type="number" value={val} onChange={(e) => onChange(e.target.value)} />;
  if (cat === 'date') return <input type="date" value={val} onChange={(e) => onChange(e.target.value)} />;
  return <input value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
}

function renderOutput(o: TableModel['outputs'][number], val: string, onChange: (v: string) => void) {
  if (o.type === 'Boolean') return <select value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (o.type === 'Number') return <input type="number" value={val} onChange={(e) => onChange(e.target.value)} />;
  return <input value={val} onChange={(e) => onChange(e.target.value)} placeholder="output" />;
}

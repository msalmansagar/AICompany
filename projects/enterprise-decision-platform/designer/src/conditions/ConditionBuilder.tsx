import { useEffect, useState } from 'react';
import { listAttributes, type AttributeMeta } from '../metadata/metadataService';
import { category, operatorsFor, arity } from '../table/tableModel';
import { emptyGroup, emptyQuantifier, type ConditionModel, type Group, type Clause, type Quantifier } from './conditionModel';

/**
 * Where a clause's field name comes from.
 *  - 'entity'  : an attribute of the rule's anchor entity, picked from metadata.
 *  - 'element' : a property of the element being quantified over. The element's shape is only
 *                known once a retrieval declares it, so the author types the name. The runtime
 *                validator suppresses symbol checking inside a quantifier body for the same reason.
 */
type FieldSource = 'entity' | 'element';

/**
 * Expression-tree authoring: build a WHEN condition as nested AND / OR / NOT groups of
 * field-operator-value clauses, with a THEN outcome and an optional ELSE. Emits a conditionSet
 * PCRM (via conditionModel), which the runtime already executes.
 */
export function ConditionBuilder({ entity, value, onChange }: {
  entity: string; value: ConditionModel; onChange: (m: ConditionModel) => void;
}) {
  const [attrs, setAttrs] = useState<AttributeMeta[]>([]);
  useEffect(() => {
    if (!entity) { setAttrs([]); return; }
    let live = true;
    listAttributes(entity).then((a) => { if (live) setAttrs(a); }).catch(() => { if (live) setAttrs([]); });
    return () => { live = false; };
  }, [entity]);

  const set = (patch: Partial<ConditionModel>) => onChange({ ...value, ...patch });
  const addOutput = () => set({ outputs: [...value.outputs, { name: `out${value.outputs.length + 1}`, type: 'Text' }] });
  const setOutput = (i: number, patch: Partial<ConditionModel['outputs'][number]>) => {
    const prev = value.outputs[i];
    const outputs = value.outputs.map((o, j) => (j === i ? { ...o, ...patch } : o));
    // keep outcome maps keyed by the (possibly renamed) output name
    const rekey = (m: Record<string, string>) => { const n = { ...m }; if (patch.name && patch.name !== prev.name) { n[patch.name] = n[prev.name] ?? ''; delete n[prev.name]; } return n; };
    set({ outputs, then: rekey(value.then), otherwise: rekey(value.otherwise) });
  };
  const removeOutput = (i: number) => {
    const name = value.outputs[i].name;
    const drop = (m: Record<string, string>) => { const n = { ...m }; delete n[name]; return n; };
    set({ outputs: value.outputs.filter((_, j) => j !== i), then: drop(value.then), otherwise: drop(value.otherwise) });
  };

  const hasElse = Object.values(value.otherwise).some((v) => v);

  return (
    <div className="cb">
      <section className="cb-when">
        <span className="cb-band cb-band-when">When — conditions</span>
        <GroupEditor group={value.when} onChange={(g) => set({ when: g })} attrs={attrs} fieldSource="entity" root />
      </section>

      <section className="cb-then">
        <div className="cb-band cb-band-then">Then — outcome</div>
        {value.outputs.map((o, i) => (
          <div key={i} className="cb-out">
            <input className="cb-outname" value={o.name} onChange={(e) => setOutput(i, { name: e.target.value })} placeholder="output" />
            <select value={o.type} onChange={(e) => setOutput(i, { type: e.target.value as any })}><option>Text</option><option>Number</option><option>Boolean</option></select>
            <span className="cb-eq">=</span>
            <input className="cb-outval" value={value.then[o.name] ?? ''} onChange={(e) => set({ then: { ...value.then, [o.name]: e.target.value } })} placeholder="value when true" />
            <button className="cb-x" title="Remove output" onClick={() => removeOutput(i)}>✕</button>
          </div>
        ))}
        <button className="cb-add" onClick={addOutput}>+ output</button>
      </section>

      <section className="cb-else">
        <div className="cb-band cb-band-else">Else — otherwise {hasElse ? '' : '(optional)'}</div>
        {value.outputs.map((o, i) => (
          <div key={i} className="cb-out">
            <span className="cb-outname muted">{o.name}</span><span className="cb-eq">=</span>
            <input className="cb-outval" value={value.otherwise[o.name] ?? ''} onChange={(e) => set({ otherwise: { ...value.otherwise, [o.name]: e.target.value } })} placeholder="value when false" />
          </div>
        ))}
      </section>
    </div>
  );
}

function GroupEditor({ group, onChange, attrs, fieldSource, root, onRemove }: {
  group: Group; onChange: (g: Group) => void; attrs: AttributeMeta[]; fieldSource: FieldSource; root?: boolean; onRemove?: () => void;
}) {
  const quantifiers = group.quantifiers ?? [];
  const addQuantifier = () => onChange({ ...group, quantifiers: [...quantifiers, emptyQuantifier()] });
  const setQuantifier = (i: number, q: Quantifier) => onChange({ ...group, quantifiers: quantifiers.map((x, j) => (j === i ? q : x)) });
  const removeQuantifier = (i: number) => onChange({ ...group, quantifiers: quantifiers.filter((_, j) => j !== i) });
  const addClause = () => onChange({ ...group, clauses: [...group.clauses, { field: '', fieldType: '', operator: '', value: '' }] });
  const setClause = (i: number, patch: Partial<Clause>) => onChange({ ...group, clauses: group.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const removeClause = (i: number) => onChange({ ...group, clauses: group.clauses.filter((_, j) => j !== i) });
  const addGroup = () => onChange({ ...group, groups: [...group.groups, emptyGroup('and')] });
  const setGroup = (i: number, g: Group) => onChange({ ...group, groups: group.groups.map((x, j) => (j === i ? g : x)) });
  const removeGroup = (i: number) => onChange({ ...group, groups: group.groups.filter((_, j) => j !== i) });

  return (
    <div className={`cb-group ${group.negate ? 'neg' : ''}`}>
      <div className="cb-group-h">
        <div className="cb-op" role="tablist">
          <button className={group.op === 'and' ? 'on' : ''} onClick={() => onChange({ ...group, op: 'and' })}>AND</button>
          <button className={group.op === 'or' ? 'on' : ''} onClick={() => onChange({ ...group, op: 'or' })}>OR</button>
        </div>
        <label className="cb-neg"><input type="checkbox" checked={!!group.negate} onChange={(e) => onChange({ ...group, negate: e.target.checked })} /> NOT</label>
        <span className="spacer" />
        {!root && onRemove && <button className="cb-x" title="Remove group" onClick={onRemove}>✕</button>}
      </div>

      {group.clauses.map((c, i) => <ClauseEditor key={i} clause={c} attrs={attrs} fieldSource={fieldSource} onChange={(p) => setClause(i, p)} onRemove={() => removeClause(i)} />)}
      {quantifiers.map((q, i) => <QuantifierEditor key={i} quantifier={q} attrs={attrs} onChange={(nq) => setQuantifier(i, nq)} onRemove={() => removeQuantifier(i)} />)}
      {group.groups.map((g, i) => <GroupEditor key={i} group={g} attrs={attrs} fieldSource={fieldSource} onChange={(ng) => setGroup(i, ng)} onRemove={() => removeGroup(i)} />)}

      <div className="cb-group-actions">
        <button className="cb-add" onClick={addClause}>+ condition</button>
        <button className="cb-add" onClick={addQuantifier}>+ for each</button>
        <button className="cb-add" onClick={addGroup}>+ group</button>
      </div>
    </div>
  );
}

/**
 * "For each element of <collection>, some / all / none satisfy ..." — the authoring shape of a
 * quantifier. The body is an ordinary group, so every operator, nesting and NOT works inside it
 * exactly as outside; only the field source changes.
 */
function QuantifierEditor({ quantifier, attrs, onChange, onRemove }: {
  quantifier: Quantifier; attrs: AttributeMeta[]; onChange: (q: Quantifier) => void; onRemove: () => void;
}) {
  return (
    <div className="cb-quant">
      <div className="cb-quant-h">
        <select className="cb-quant-kind" value={quantifier.kind}
          onChange={(e) => onChange({ ...quantifier, kind: e.target.value as Quantifier['kind'] })}>
          <option value="all">ALL of</option>
          <option value="some">SOME of</option>
          <option value="none">NONE of</option>
        </select>
        <input className="cb-quant-coll" value={quantifier.collection} placeholder="collection (e.g. invoices)"
          onChange={(e) => onChange({ ...quantifier, collection: e.target.value })} />
        <span className="cb-quant-sat">satisfy</span>
        <span className="spacer" />
        <button className="cb-x" title="Remove for-each" onClick={onRemove}>✕</button>
      </div>
      <GroupEditor group={quantifier.where} attrs={attrs} fieldSource="element"
        onChange={(g) => onChange({ ...quantifier, where: g })} root />
      <p className="cb-quant-hint muted">
        Fields here belong to each element. A parent field of the same name is shadowed, so compare
        against a differently-named parent field.
      </p>
    </div>
  );
}

function ClauseEditor({ clause, attrs, fieldSource, onChange, onRemove }: {
  clause: Clause; attrs: AttributeMeta[]; fieldSource: FieldSource; onChange: (p: Partial<Clause>) => void; onRemove: () => void;
}) {
  const cat = clause.fieldType ? category(clause.fieldType) : 'text';
  const ops = operatorsFor(cat);
  const n = arity(cat, clause.operator);
  return (
    <div className="cb-clause">
      {fieldSource === 'entity' ? (
        <select className="cb-field" value={clause.field}
          onChange={(e) => { const a = attrs.find((x) => x.logicalName === e.target.value); onChange({ field: e.target.value, fieldType: a?.type ?? 'Text', operator: '', value: '' }); }}>
          <option value="">— field —</option>
          {attrs.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>)}
        </select>
      ) : (
        <input className="cb-field" value={clause.field} placeholder="element field"
          onChange={(e) => onChange({ field: e.target.value, fieldType: clause.fieldType || 'Text' })} />
      )}
      <select className="cb-op2" value={clause.operator} disabled={!clause.field} onChange={(e) => onChange({ operator: e.target.value })}>
        <option value="">op</option>
        {ops.filter((o) => o.op !== 'Any').map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {n >= 1 && valueInput(cat, clause.value ?? '', (v) => onChange({ value: v }))}
      {n === 2 && <><span className="cb-and2">and</span>{valueInput(cat, clause.value2 ?? '', (v) => onChange({ value2: v }))}</>}
      <button className="cb-x" title="Remove condition" onClick={onRemove}>✕</button>
    </div>
  );
}

function valueInput(cat: string, val: string, onChange: (v: string) => void) {
  if (cat === 'boolean') return <select className="cb-val" value={val} onChange={(e) => onChange(e.target.value)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (cat === 'number') return <input className="cb-val" type="number" value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
  return <input className="cb-val" value={val} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
}

import { useEffect, useState } from 'react';
import { searchEntities, listAttributes, listOptions, type EntityMeta, type AttributeMeta, type OptionMeta } from './metadataService';

const OPTION_TYPES = new Set(['Picklist', 'State', 'Status']);

export function MetadataExplorer({ defaultEntity, onClose }: { defaultEntity?: string; onClose: () => void }) {
  const [entityTerm, setEntityTerm] = useState(defaultEntity ?? '');
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [entity, setEntity] = useState<string>('');
  const [attrTerm, setAttrTerm] = useState('');
  const [attrs, setAttrs] = useState<AttributeMeta[]>([]);
  const [options, setOptions] = useState<Record<string, OptionMeta[]>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void doEntitySearch(defaultEntity ?? ''); /* initial */ }, []); // eslint-disable-line

  async function doEntitySearch(term: string) {
    setBusy(true);
    try { setEntities(await searchEntities(term)); }
    catch (e: any) { setMsg('Metadata error: ' + e.message); }
    finally { setBusy(false); }
  }

  async function selectEntity(logicalName: string) {
    setEntity(logicalName);
    setAttrs([]);
    setOptions({});
    setBusy(true);
    try { setAttrs(await listAttributes(logicalName)); }
    catch (e: any) { setMsg('Field load error: ' + e.message); }
    finally { setBusy(false); }
  }

  async function toggleOptions(a: AttributeMeta) {
    if (options[a.logicalName]) { setOptions(({ [a.logicalName]: _omit, ...rest }) => rest); return; }
    const opts = await listOptions(entity, a.logicalName);
    setOptions((o) => ({ ...o, [a.logicalName]: opts }));
  }

  function use(a: AttributeMeta) {
    navigator.clipboard?.writeText(a.logicalName).catch(() => {});
    setMsg(`Copied “${a.logicalName}” — paste it into a decision-table column, condition, or formula.`);
  }

  const shown = attrs.filter((a) => {
    const t = attrTerm.trim().toLowerCase();
    return !t || a.logicalName.toLowerCase().includes(t) || a.displayName.toLowerCase().includes(t);
  });

  return (
    <aside className="mdpanel">
      <div className="tp-head">
        <strong>CRM Fields</strong>
        <span className="tp-sub">metadata explorer</span>
        <span className="spacer" />
        <button className="tp-close" onClick={onClose}>✕</button>
      </div>

      <label>Entity</label>
      <div className="md-row">
        <input value={entityTerm} placeholder="search entity…" onChange={(e) => setEntityTerm(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && doEntitySearch(entityTerm)} />
        <button onClick={() => doEntitySearch(entityTerm)}>Find</button>
      </div>
      {!entity && (
        <div className="md-list">
          {entities.map((e) => (
            <button key={e.logicalName} className="md-item" onClick={() => selectEntity(e.logicalName)}>
              <span>{e.displayName}</span><code>{e.logicalName}</code>
            </button>
          ))}
        </div>
      )}

      {entity && (
        <>
          <div className="md-crumb">
            <button className="md-back" onClick={() => setEntity('')}>← entities</button>
            <code>{entity}</code>
          </div>
          <label>Field</label>
          <input value={attrTerm} placeholder="search field…" onChange={(e) => setAttrTerm(e.target.value)} />
          <div className="md-list">
            {shown.map((a) => (
              <div key={a.logicalName} className="md-field">
                <div className="md-field-top">
                  <span className="md-fname">{a.displayName}</span>
                  <span className="md-type">{a.type}</span>
                  <span className="spacer" />
                  {OPTION_TYPES.has(a.type) && <button className="md-mini" onClick={() => toggleOptions(a)}>options</button>}
                  <button className="md-use" onClick={() => use(a)}>Use ⧉</button>
                </div>
                <code className="md-logical">{a.logicalName}</code>
                {options[a.logicalName] && (
                  <div className="md-options">
                    {options[a.logicalName].map((o) => (
                      <span key={o.value} className="md-opt">{o.label} <em>= {o.value}</em></span>
                    ))}
                    {options[a.logicalName].length === 0 && <span className="md-opt">(no options)</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {busy && <p className="tp-sub">loading…</p>}
      {msg && <p className="md-msg">{msg}</p>}
    </aside>
  );
}

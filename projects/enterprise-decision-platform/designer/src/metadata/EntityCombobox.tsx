import { useEffect, useRef, useState } from 'react';
import type { EntityMeta } from './metadataService';

/**
 * Fluent-style searchable combobox for choosing a Dataverse table. Filters by both the
 * business display name and the schema logical name, shows the display name primarily
 * with the schema name as secondary, and supports keyboard navigation — the native
 * <datalist> can do none of this.
 */
const CAP = 100;

export function EntityCombobox({
  entities, value, onChange, onClose, autoFocus, loading, placeholder = 'Search tables…',
}: {
  entities: EntityMeta[];
  value: string;
  onChange: (logicalName: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = entities.find((e) => e.logicalName === value);
  const term = q.trim().toLowerCase();
  const matches = term
    ? entities.filter((e) => e.displayName.toLowerCase().includes(term) || e.logicalName.toLowerCase().includes(term))
    : entities;
  const filtered = matches.slice(0, CAP);
  const truncated = matches.length - filtered.length;

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) { setOpen(false); onClose?.(); }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  function pick(e: EntityMeta) { onChange(e.logicalName); setQ(''); setOpen(false); }

  return (
    <div className="cbx" ref={wrapRef}>
      <div className={`cbx-field ${open ? 'open' : ''}`}>
        <input
          className="cbx-input"
          value={open ? q : (selected?.displayName ?? value)}
          autoFocus={autoFocus}
          placeholder={open ? (selected?.displayName ?? placeholder) : placeholder}
          spellCheck={false}
          aria-label="Table"
          onFocus={() => { setOpen(true); setQ(''); setHi(0); }}
          onChange={(ev) => { setQ(ev.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (ev.key === 'Enter') { ev.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
            else if (ev.key === 'Escape') { setOpen(false); onClose?.(); }
          }}
        />
        <svg className="cbx-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </div>

      {open && (
        <div className="cbx-pop" role="listbox">
          {loading ? (
            <div className="cbx-empty">Loading tables…</div>
          ) : filtered.length === 0 ? (
            <div className="cbx-empty">{entities.length === 0 ? 'No tables loaded.' : `No tables match “${q}”.`}</div>
          ) : (
            <>
              {filtered.map((e, i) => (
                <button
                  key={e.logicalName}
                  className={`cbx-item ${i === hi ? 'hi' : ''} ${e.logicalName === value ? 'sel' : ''}`}
                  role="option"
                  aria-selected={e.logicalName === value}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}
                >
                  <span className="cbx-name">{e.displayName}</span>
                  <span className="cbx-logical">{e.logicalName}</span>
                </button>
              ))}
              {truncated > 0 && <div className="cbx-more">Showing {CAP} of {matches.length} — keep typing to narrow.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

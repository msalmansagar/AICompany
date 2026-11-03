import { useEffect, useRef, useState } from 'react';
import { searchRecords, type RecordRef } from '../dataverse/records';

/**
 * Inline record combobox for lookup condition cells: type to search the target
 * entity by primary name, pick a record, and the cell stores its GUID (the name
 * is kept as a display label only).
 */
export function RecordPicker({ entity, valueLabel, onPick }: {
  entity: string;
  valueLabel: string;
  onPick: (r: RecordRef) => void;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<RecordRef[]>([]);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function search(next: string) {
    setTerm(next); setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      searchRecords(entity, next)
        .then((r) => { setResults(r); setError(''); })
        .catch((e) => { setResults([]); setError(e.message); });
    }, 250);
  }

  function pick(r: RecordRef) {
    onPick(r);
    setOpen(false); setTerm('');
  }

  return (
    <span className="rpick">
      <input
        value={open ? term : valueLabel}
        placeholder="search record…"
        spellCheck={false}
        onFocus={() => search(term)}
        onChange={(e) => search(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="rpick-list">
          {error && <span className="rpick-msg rpick-err">{error}</span>}
          {!error && results.length === 0 && <span className="rpick-msg">No records found.</span>}
          {results.map((r) => (
            // onMouseDown so the pick lands before the input's blur closes the list.
            <button key={r.id} type="button" onMouseDown={() => pick(r)} title={r.id}>{r.name}</button>
          ))}
        </div>
      )}
    </span>
  );
}

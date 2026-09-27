import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The lookup picker (agentation feedback, CWFD-018): clicking a lookup-shaped
 * field opens a search dialog — the way Dynamics picks records — instead of
 * an inline dropdown fighting the 300px panel for space.
 *
 * `LookupField` is the field half: a button styled like an input that shows
 * the current choice and opens the dialog. `LookupDialog` is the popup:
 * autofocused search, arrow-key navigation, Enter picks, Escape closes.
 * Built on the same .dialog classes the confirm dialog uses.
 */

export interface LookupOption {
  id: string;
  name: string;
  /** Secondary line under the name — a summary, a type, a sequence number. */
  hint?: string;
}

export function LookupField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  required = false,
  clearLabel,
  dialogTitle,
}: {
  label: string;
  placeholder: string;
  options: LookupOption[];
  value: string | null;
  onChange: (id: string, name: string) => void;
  disabled?: boolean;
  required?: boolean;
  /** When set, the dialog offers this as a pick-nothing entry (id ''). */
  clearLabel?: string;
  dialogTitle?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedName = options.find((option) => option.id === value)?.name ?? '';

  return (
    <div className="field">
      <label className="lbl">
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          className="fluent-input"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          title={selectedName || placeholder}
          style={fieldButtonStyle}
        >
          <span style={selectedName ? fieldValueStyle : fieldPlaceholderStyle}>
            {selectedName || placeholder}
          </span>
          <span aria-hidden style={magnifierStyle}>⌕</span>
        </button>
        {value && !disabled && (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24, position: 'absolute', right: 26 }}
            onClick={() => onChange('', '')}
            aria-label={`Clear ${label}`}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <LookupDialog
          title={dialogTitle ?? label}
          options={options}
          selectedId={value}
          clearLabel={clearLabel}
          onPick={(id, name) => {
            onChange(id, name);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export function LookupDialog({
  title,
  options,
  selectedId,
  clearLabel,
  onPick,
  onClose,
}: {
  title: string;
  options: LookupOption[];
  selectedId: string | null;
  clearLabel?: string;
  onPick: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo<LookupOption[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? options.filter(
          (option) =>
            option.name.toLowerCase().includes(needle) ||
            option.hint?.toLowerCase().includes(needle)
        )
      : options;
    return clearLabel ? [{ id: '', name: clearLabel }, ...matches] : matches;
  }, [options, query, clearLabel]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[Math.min(highlight, rows.length - 1)];
      if (row) onPick(row.id, row.id ? row.name : '');
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        style={{ width: 440 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
        </div>
        <div className="dialog-body" style={{ paddingTop: 8 }}>
          <input
            type="text"
            className="fluent-input"
            placeholder="Search…"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`Search ${title}`}
          />
          <ul style={listStyle} role="listbox" ref={listRef}>
            {rows.length === 0 && <li style={emptyStyle}>No results</li>}
            {rows.map((row, index) => (
              <li key={row.id || '__clear__'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={row.id === (selectedId ?? '')}
                  data-highlighted={index === highlight}
                  style={rowStyle(index === highlight, row.id === (selectedId ?? ''))}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => onPick(row.id, row.id ? row.name : '')}
                >
                  <span style={rowNameStyle(!row.id)}>{row.name}</span>
                  {row.hint && <span style={rowHintStyle}>{row.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
};

const fieldValueStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const fieldPlaceholderStyle: React.CSSProperties = {
  ...fieldValueStyle,
  color: 'var(--text-secondary)',
};

const magnifierStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  flexShrink: 0,
  fontSize: 14,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '10px 0 0',
  padding: 0,
  maxHeight: '46vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const emptyStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};

function rowStyle(isHighlighted: boolean, isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 1,
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 12.5,
    color: 'var(--text)',
    background: isHighlighted
      ? 'var(--primary-tint-2)'
      : isSelected
        ? 'var(--surface-alt)'
        : 'transparent',
    border: 'none',
    borderRadius: 5,
    padding: '7px 9px',
    cursor: 'pointer',
  };
}

function rowNameStyle(isClearEntry: boolean): React.CSSProperties {
  return {
    fontWeight: 600,
    fontStyle: isClearEntry ? 'italic' : undefined,
    color: isClearEntry ? 'var(--text-secondary)' : 'var(--text)',
  };
}

const rowHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
};

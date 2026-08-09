import { useState, useRef, useEffect, useCallback } from 'react';

interface DropdownOption {
  id: string;
  name: string;
}

interface SearchableDropdownProps {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  value: string | null;
  onChange: (id: string, name: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export function SearchableDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  required = false,
}: SearchableDropdownProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedName = options.find((o) => o.id === value)?.name ?? '';

  // Keep input text in sync with external value changes
  useEffect(() => {
    if (!isOpen) {
      setInputText(selectedName);
    }
  }, [selectedName, isOpen]);

  const filteredOptions = inputText && inputText !== selectedName
    ? options.filter((o) => o.name.toLowerCase().includes(inputText.toLowerCase()))
    : options;

  const handleFocus = useCallback(() => {
    if (disabled) return;
    setInputText('');
    setIsOpen(true);
  }, [disabled]);

  const handleChange = useCallback((text: string) => {
    setInputText(text);
    setIsOpen(true);
  }, []);

  const handleSelect = useCallback((option: DropdownOption) => {
    setInputText(option.name);
    setIsOpen(false);
    onChange(option.id, option.name);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setInputText(selectedName);
    }
  }, [selectedName]);

  // Restore displayed text when clicking outside without selecting
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setInputText(selectedName);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [selectedName]);

  return (
    <div style={wrapperStyle} ref={containerRef}>
      <label style={labelStyle}>
        {label}
        {required && <span style={requiredMark}> *</span>}
      </label>
      <div style={inputWrapStyle}>
        <input
          type="text"
          value={isOpen ? inputText : selectedName}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={handleFocus}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ ...inputStyle, ...(disabled ? inputDisabledStyle : {}) }}
          aria-label={label}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
        />
        {value && !isOpen && (
          <button
            type="button"
            style={clearBtnStyle}
            onMouseDown={(e) => { e.preventDefault(); onChange('', ''); setInputText(''); }}
            tabIndex={-1}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <ul style={listStyle} role="listbox">
          {filteredOptions.length === 0 ? (
            <li style={noResultsStyle}>No results</li>
          ) : (
            filteredOptions.map((option) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                style={option.id === value ? { ...listItemStyle, ...listItemActiveStyle } : listItemStyle}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
              >
                {option.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text)',
};

const requiredMark: React.CSSProperties = { color: 'var(--error)' };

const inputWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 32px 0 10px',
  background: 'var(--surface)',
  border: '1.5px solid var(--border-strong)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const inputDisabledStyle: React.CSSProperties = {
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  cursor: 'not-allowed',
  borderColor: 'var(--border)',
};

const clearBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  background: 'none',
  border: 'none',
  color: 'var(--text-disabled)',
  fontSize: 16,
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
};

const listStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 2px)',
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: 'auto',
  background: 'var(--surface)',
  border: '1.5px solid var(--border-strong)',
  borderRadius: 6,
  margin: 0,
  padding: '4px 0',
  listStyle: 'none',
  zIndex: 99999,
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
};

const listItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text)',
  cursor: 'pointer',
  lineHeight: 1.4,
};

const listItemActiveStyle: React.CSSProperties = {
  background: 'var(--primary-tint-2)',
  color: 'var(--primary-pressed)',
  fontWeight: 500,
};

const noResultsStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  color: 'var(--text-disabled)',
  fontStyle: 'italic',
};

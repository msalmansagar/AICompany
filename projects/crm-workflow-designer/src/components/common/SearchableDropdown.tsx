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
    <div className="field" style={{ position: 'relative' }} ref={containerRef}>
      <label className="lbl">
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={isOpen ? inputText : selectedName}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={handleFocus}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="fluent-input"
          aria-label={label}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
        />
        {value && !isOpen && (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24, position: 'absolute', right: 4 }}
            onMouseDown={(e) => { e.preventDefault(); onChange('', ''); setInputText(''); }}
            tabIndex={-1}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <ul className="dropdown-list" role="listbox">
          {filteredOptions.length === 0 ? (
            <li className="dropdown-empty">No results</li>
          ) : (
            filteredOptions.map((option) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                className={option.id === value ? 'dropdown-option active' : 'dropdown-option'}
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



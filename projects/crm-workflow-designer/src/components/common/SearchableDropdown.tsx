import { LookupField } from './LookupDialog';

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

/**
 * Historically an inline combobox; now the lookup-dialog pattern (agentation
 * feedback, CWFD-018) — clicking the field opens a search popup, the way
 * Dynamics picks records. The props are unchanged, so every caller (wizards,
 * assignment, process dialogs) upgraded together.
 */
export function SearchableDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  required = false,
}: SearchableDropdownProps) {
  return (
    <LookupField
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
    />
  );
}

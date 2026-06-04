import { Combobox, Option } from '@fluentui/react-components';
import type { EntityOption } from '@/types/WorkflowTypes';

interface EntityComboboxProps {
  entities: EntityOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function EntityCombobox({
  entities,
  value,
  onChange,
  placeholder = 'Search entity...',
}: EntityComboboxProps) {
  const selected = entities.find((e) => e.logicalName === value);
  const displayValue = selected?.displayName ?? value;

  return (
    <Combobox
      value={displayValue}
      selectedOptions={value ? [value] : []}
      onOptionSelect={(_, data) => {
        onChange(data.optionValue ?? '');
      }}
      placeholder={placeholder}
    >
      {entities.map((entity) => (
        <Option key={entity.logicalName} value={entity.logicalName} text={`${entity.displayName} (${entity.logicalName})`}>
          {entity.displayName} ({entity.logicalName})
        </Option>
      ))}
    </Combobox>
  );
}

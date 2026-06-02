import { Combobox, Option, Spinner } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCrmAdapter } from '@/app/CrmAdapterContext';

interface AttributeComboboxProps {
  entityLogicalName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AttributeCombobox({
  entityLogicalName,
  value,
  onChange,
  placeholder = 'Select attribute...',
}: AttributeComboboxProps) {
  const adapter = useCrmAdapter();

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: ['attributes', entityLogicalName],
    queryFn: () => adapter.getAttributes(entityLogicalName),
    enabled: !!entityLogicalName,
    staleTime: 5 * 60 * 1000,
  });

  const selected = attributes.find((a) => a.schemaName === value);
  const displayValue = selected?.displayName ?? value;

  if (isLoading) {
    return <Spinner size="tiny" label="Loading attributes..." />;
  }

  return (
    <Combobox
      value={displayValue}
      selectedOptions={value ? [value] : []}
      onOptionSelect={(_ev, data) => {
        onChange(data.optionValue ?? '');
      }}
      placeholder={entityLogicalName ? placeholder : 'Select entity first'}
      disabled={!entityLogicalName}
    >
      {attributes.map((attr) => (
        <Option key={attr.schemaName} value={attr.schemaName} text={`${attr.displayName} (${attr.schemaName})`}>
          {attr.displayName} ({attr.schemaName})
        </Option>
      ))}
    </Combobox>
  );
}

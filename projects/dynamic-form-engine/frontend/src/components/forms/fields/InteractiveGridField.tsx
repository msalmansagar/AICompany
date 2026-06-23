// Thin dispatcher: reads gridMode and renders SelectionGridField or EntryGridField.
// Does not own state.

import { Text } from '@fluentui/react-components';
import { SelectionGridField } from './SelectionGridField';
import { EntryGridField } from './EntryGridField';
import type { ControlProps } from '../FieldRenderer';

interface InteractiveGridFieldProps extends ControlProps {
  isTabActive: boolean;
}

export function InteractiveGridField(props: InteractiveGridFieldProps) {
  const { field, isTabActive, ...rest } = props;

  const gridConfig = field.gridConfig;
  // API emits `mode`; fall back to legacy `gridMode` for existing test fixtures
  const gridMode = gridConfig?.mode ?? gridConfig?.gridMode;

  if (gridMode === 'selection') {
    return (
      <SelectionGridField
        field={field}
        isTabActive={isTabActive}
        {...rest}
      />
    );
  }

  if (gridMode === 'entry') {
    return <EntryGridField field={field} {...rest} />;
  }

  return (
    <Text>
      Configuration error: interactive-grid field &quot;{field.label}&quot; has no
      grid mode configured.
    </Text>
  );
}

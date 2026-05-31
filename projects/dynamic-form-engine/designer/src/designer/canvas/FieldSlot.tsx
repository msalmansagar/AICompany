import React, { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  makeStyles,
  shorthands,
  tokens,
  Text,
  Button,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import { Delete24Regular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  fieldSlot: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '4px',
    padding: '8px 10px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'border-color 0.1s, box-shadow 0.1s',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      boxShadow: `0 0 0 1px ${tokens.colorBrandStroke1}`,
    },
  },
  fieldSlotSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1}`,
  },
  fieldSlotDragging: {
    opacity: 0.4,
    cursor: 'grabbing',
  },
  fieldContent: {
    flex: 1,
    overflow: 'hidden',
  },
  fieldLabel: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fieldType: {
    marginTop: '2px',
  },
  fieldActions: {
    flexShrink: 0,
  },
});

interface FieldSlotProps {
  field: DesignerFieldModel;
}

export function FieldSlot({ field }: FieldSlotProps): React.ReactElement {
  const styles = useStyles();
  const { selectItem, selectedId, deleteField } = useDesignerStore();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { type: 'field', fieldId: field.id, sectionId: field.sectionId },
  });

  const isSelected = selectedId === field.id;

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectItem(field.id, 'field');
    },
    [field.id, selectItem]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteField(field.id);
    },
    [field.id, deleteField]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.fieldSlot} ${isSelected ? styles.fieldSlotSelected : ''} ${isDragging ? styles.fieldSlotDragging : ''}`}
      {...attributes}
      {...listeners}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      aria-label={`Field: ${field.label || field.code}`}
      aria-pressed={isSelected}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(e as unknown as React.MouseEvent); }}
    >
      <div className={styles.fieldContent}>
        <Text weight="semibold" size={200} className={styles.fieldLabel}>
          {field.label || 'Unnamed Field'}
          {field.isRequired && <span style={{ color: tokens.colorPaletteRedForeground1 }}> *</span>}
        </Text>
        <div className={styles.fieldType}>
          <Badge appearance="ghost" size="small" color="informative">
            {field.fieldType}
          </Badge>
        </div>
      </div>
      <div className={styles.fieldActions}>
        <Tooltip content="Delete Field" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Delete24Regular />}
            onClick={handleDelete}
            aria-label="Delete Field"
          />
        </Tooltip>
      </div>
    </div>
  );
}

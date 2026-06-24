import React, { useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import { Delete24Regular, Edit24Regular } from '@fluentui/react-icons';
import { FieldSlot } from './FieldSlot';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerSectionModel, DesignerFieldModel } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  sectionWrapper: {
    marginBottom: '12px',
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    gap: '8px',
    cursor: 'grab',
  },
  sectionLabel: {
    flex: 1,
  },
  sectionActions: {
    display: 'flex',
    gap: '4px',
  },
  sectionBody: {
    padding: '12px',
    minHeight: '60px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fieldGrid1: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px' },
  fieldGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  fieldGrid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' },
  emptyDropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: '4px',
    padding: '24px 16px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
  sectionDragging: {
    opacity: 0.5,
  },
  dropActive: {
    border: `2px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
});

interface SectionContainerProps {
  section: DesignerSectionModel;
  fields: DesignerFieldModel[];
}

export function SectionContainer({ section, fields }: SectionContainerProps): React.ReactElement {
  const styles = useStyles();
  const { selectItem, deleteSection } = useDesignerStore();

  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { type: 'section', sectionId: section.id },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `section-drop-${section.id}`,
    data: { type: 'section', sectionId: section.id },
  });

  const gridClassName =
    section.columnCount === 3
      ? styles.fieldGrid3
      : section.columnCount === 2
      ? styles.fieldGrid2
      : styles.fieldGrid1;

  const handleSelectSection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectItem(section.id, 'section');
    },
    [section.id, selectItem]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`${styles.sectionWrapper} ${isDragging ? styles.sectionDragging : ''}`}
      aria-label={`Section: ${section.label}`}
    >
      <div
        className={styles.sectionHeader}
        onClick={handleSelectSection}
        {...attributes}
        {...listeners}
      >
        <Text weight="semibold" size={200} className={styles.sectionLabel}>
          {section.label || 'Unnamed Section'}
        </Text>
        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
          {section.columnCount} col
        </Text>
        <div className={styles.sectionActions}>
          <Tooltip content="Edit Section" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<Edit24Regular />}
              onClick={handleSelectSection}
              aria-label="Edit Section"
            />
          </Tooltip>
          <Tooltip content="Delete Section" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<Delete24Regular />}
              onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }}
              aria-label="Delete Section"
            />
          </Tooltip>
        </div>
      </div>

      <div
        ref={setDropRef}
        className={`${styles.sectionBody} ${isOver ? styles.dropActive : ''}`}
      >
        {fields.length === 0 ? (
          <div className={styles.emptyDropZone}>
            Drop fields here
          </div>
        ) : (
          <div className={gridClassName}>
            {fields.map(field => (
              <FieldSlot key={field.id} field={field} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

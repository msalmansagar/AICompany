import React, { useCallback, useRef } from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import {
  shouldVirtualizeFieldList,
  ESTIMATED_FIELD_SLOT_HEIGHT_PX,
  VIRTUALIZED_SECTION_MAX_HEIGHT_PX,
} from '@/designer/dnd/dndConstants';

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

  // Disable virtualisation while a pointer drag is active so all FieldSlot DOM nodes
  // exist — dnd-kit's collision detection needs them during the drag gesture.
  const { active } = useDndContext();
  const isDragActive = active !== null;
  const isVirtualized = shouldVirtualizeFieldList(fields.length) && !isDragActive;

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: isVirtualized ? fields.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_FIELD_SLOT_HEIGHT_PX,
    overscan: 3,
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

  const handleDeleteSection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteSection(section.id);
    },
    [section.id, deleteSection]
  );

  // Combine the droppable ref and the virtualiser scroll container ref.
  const assignBodyRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDropRef(el);
      scrollContainerRef.current = el;
    },
    [setDropRef]
  );

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sectionBodyStyle: React.CSSProperties | undefined = isVirtualized
    ? { maxHeight: VIRTUALIZED_SECTION_MAX_HEIGHT_PX, overflowY: 'auto' }
    : undefined;

  return (
    <div
      ref={setSortableRef}
      style={sortableStyle}
      className={`${styles.sectionWrapper} ${isDragging ? styles.sectionDragging : ''}`}
      aria-label={`Section: ${section.label}`}
    >
      <div
        className={styles.sectionHeader}
        onClick={handleSelectSection}
        // IndexBasedKeyboardSensor reads these to identify the section on Alt+Arrow.
        data-sortable-id={section.id}
        data-sortable-container={section.tabId}
        data-sortable-type="section"
        aria-label={`Section: ${section.label || 'Unnamed Section'}. Alt+ArrowUp/Down to reorder.`}
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
              onClick={handleDeleteSection}
              aria-label="Delete Section"
            />
          </Tooltip>
        </div>
      </div>

      <div
        ref={assignBodyRef}
        className={`${styles.sectionBody} ${isOver ? styles.dropActive : ''}`}
        style={sectionBodyStyle}
      >
        {fields.length === 0 && (
          <div className={styles.emptyDropZone}>Drop fields here</div>
        )}

        {fields.length > 0 && isVirtualized && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => {
              const field = fields[vItem.index];
              if (!field) return null;
              return (
                <div
                  key={field.id}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                    paddingBottom: '8px',
                  }}
                >
                  <FieldSlot field={field} />
                </div>
              );
            })}
          </div>
        )}

        {fields.length > 0 && !isVirtualized && (
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

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { makeStyles, mergeClasses, shorthands, tokens, Text, Tooltip } from '@fluentui/react-components';
import type { FieldTypeDefinition } from '@/constants/fieldTypes';
import { FIELD_TYPE_ICONS } from './fieldTypeIcons';

const useStyles = makeStyles({
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 4px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '4px',
    cursor: 'grab',
    backgroundColor: tokens.colorNeutralBackground1,
    userSelect: 'none',
    textAlign: 'center',
    minHeight: '64px',
    transition: 'background-color 0.1s, border-color 0.1s',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      ...shorthands.borderColor(tokens.colorBrandStroke1),
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: '2px',
    },
  },
  itemDragging: {
    opacity: 0.5,
    cursor: 'grabbing',
  },
  itemDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1,
      ...shorthands.borderColor(tokens.colorNeutralStroke1),
    },
  },
  comingSoonBadge: {
    fontSize: '9px',
    lineHeight: '12px',
    color: tokens.colorNeutralForeground4,
    fontStyle: 'italic',
  },
  // Wrapper span — sets font-size so the SVG icon's width="1em" resolves correctly
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    lineHeight: '1',
    color: tokens.colorNeutralForeground2,
  },
  label: {
    fontSize: '11px',
    lineHeight: '14px',
    color: tokens.colorNeutralForeground2,
  },
});

interface DraggableToolboxItemProps {
  fieldDef: FieldTypeDefinition;
}

export function DraggableToolboxItem({ fieldDef }: DraggableToolboxItemProps): React.ReactElement {
  const styles = useStyles();
  const isDisabled = fieldDef.comingSoon === true;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbox-${fieldDef.type}`,
    disabled: isDisabled,
    data: {
      source: 'toolbox',
      fieldType: fieldDef.type,
    },
  });

  const Icon = FIELD_TYPE_ICONS[fieldDef.type];

  const content = (
    <div
      ref={setNodeRef}
      className={mergeClasses(
        styles.item,
        isDragging && styles.itemDragging,
        isDisabled && styles.itemDisabled,
      )}
      {...(isDisabled ? {} : listeners)}
      {...(isDisabled ? {} : attributes)}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-label={`${fieldDef.label}${isDisabled ? ' (coming soon)' : ' field — drag to add'}`}
      aria-grabbed={isDragging}
      aria-disabled={isDisabled}
    >
      <span className={styles.iconWrapper}>
        <Icon />
      </span>
      <Text className={styles.label}>{fieldDef.label}</Text>
      {isDisabled && <Text className={styles.comingSoonBadge}>coming soon</Text>}
    </div>
  );

  if (isDisabled) {
    return (
      <Tooltip
        content="Not yet available — this field type is planned for a future sprint"
        relationship="description"
      >
        {content}
      </Tooltip>
    );
  }

  return content;
}

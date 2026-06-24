import React, { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  makeStyles,
  tokens,
  Button,
  Text,
} from '@fluentui/react-components';
import { Add24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerTabModel } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: '0 8px',
    gap: '2px',
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    gap: '6px',
    userSelect: 'none',
    borderRadius: '4px 4px 0 0',
    transition: 'background-color 0.1s',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  tabActive: {
    borderBottomColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tabDragging: {
    opacity: 0.5,
  },
  addTabButton: {
    flexShrink: 0,
  },
});

interface TabBarProps {
  tabs: Record<string, DesignerTabModel>;
  tabOrder: string[];
  selectedTabId: string;
  onSelectTab: (tabId: string) => void;
  onReorderTabs: (newOrder: string[]) => void;
}

export function TabBar({
  tabs,
  tabOrder,
  selectedTabId,
  onSelectTab,
}: TabBarProps): React.ReactElement {
  const styles = useStyles();
  const { addTab, deleteTab, form } = useDesignerStore();

  const handleAddTab = useCallback(() => {
    const newTab: DesignerTabModel = {
      id: `tmp_tab_${Date.now()}`,
      formId: form?.id ?? '',
      label: `Tab ${tabOrder.length + 1}`,
      iconName: null,
      sortOrder: tabOrder.length,
      isVisible: true,
      requiresPreviousTabComplete: false,
      hideTabBar: false,
    };
    addTab(newTab);
    onSelectTab(newTab.id);
  }, [addTab, form?.id, tabOrder.length, onSelectTab]);

  return (
    <div className={styles.tabBar} role="tablist" aria-label="Form Tabs">
      {tabOrder.map(tabId => {
        const tab = tabs[tabId];
        if (!tab) return null;
        return (
          <SortableTab
            key={tabId}
            tab={tab}
            isSelected={tabId === selectedTabId}
            onSelect={() => onSelectTab(tabId)}
            onDelete={() => deleteTab(tabId)}
            canDelete={tabOrder.length > 1}
          />
        );
      })}
      <Button
        className={styles.addTabButton}
        appearance="subtle"
        icon={<Add24Regular />}
        onClick={handleAddTab}
        aria-label="Add Tab"
        size="small"
      />
    </div>
  );
}

interface SortableTabProps {
  tab: DesignerTabModel;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function SortableTab({ tab, isSelected, onSelect, onDelete, canDelete }: SortableTabProps): React.ReactElement {
  const styles = useStyles();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    data: { type: 'tab', tabId: tab.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.tab} ${isSelected ? styles.tabActive : ''} ${isDragging ? styles.tabDragging : ''}`}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      <Text size={300} weight={isSelected ? 'semibold' : 'regular'}>
        {tab.label || 'Unnamed Tab'}
      </Text>
      {canDelete && isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete tab ${tab.label}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            color: tokens.colorNeutralForeground3,
          }}
        >
          <Delete24Regular style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
}

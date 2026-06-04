import React, { useCallback, useEffect, useState } from 'react';
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  makeStyles,
  tokens,
  Button,
} from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { TabBar } from './TabBar';
import { SectionContainer } from './SectionContainer';
import { useDesignerStore } from '@/state/designerStore';
import type {
  DesignerTabModel,
  DesignerSectionModel,
  DesignerFieldModel,
} from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  canvas: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '8px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'hidden',
    minHeight: '600px',
    display: 'flex',
    flexDirection: 'column',
  },
  tabContent: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
  },
  addSectionBar: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px',
    borderTop: `1px dashed ${tokens.colorNeutralStroke1}`,
    marginTop: '8px',
  },
});

interface DesignerCanvasProps {
  tabs: Record<string, DesignerTabModel>;
  sections: Record<string, DesignerSectionModel>;
  fields: Record<string, DesignerFieldModel>;
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;
  fieldOrder: Record<string, string[]>;
  activeTabId: string | null;
}

export function DesignerCanvas({
  tabs,
  sections,
  fields,
  tabOrder,
  sectionOrder,
  fieldOrder,
  activeTabId,
}: DesignerCanvasProps): React.ReactElement {
  const styles = useStyles();
  const [selectedTabId, setSelectedTabId] = useState<string>(activeTabId ?? tabOrder[0] ?? '');
  const { addSection, reorderTabs, selectItem, setActiveCanvasTab } = useDesignerStore();

  useEffect(() => {
    const initialTab = activeTabId ?? tabOrder[0] ?? '';
    if (initialTab) setActiveCanvasTab(initialTab);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTab = useCallback((tabId: string) => {
    setSelectedTabId(tabId);
    setActiveCanvasTab(tabId);
    selectItem(tabId, 'tab');
  }, [selectItem, setActiveCanvasTab]);

  const handleAddSection = useCallback(() => {
    const existingSectionIds = sectionOrder[selectedTabId] ?? [];
    addSection({
      id: `tmp_section_${Date.now()}`,
      tabId: selectedTabId,
      label: `Section ${existingSectionIds.length + 1}`,
      description: null,
      columnCount: 1,
      isCollapsible: false,
      isExpandedByDefault: true,
      isVisible: true,
      sortOrder: existingSectionIds.length,
    });
  }, [selectedTabId, sectionOrder, addSection]);

  const activeSectionIds = sectionOrder[selectedTabId] ?? [];

  return (
    <div className={styles.canvas} role="main" aria-label="Form Canvas">
      <SortableContext items={tabOrder} strategy={horizontalListSortingStrategy}>
        <TabBar
          tabs={tabs}
          tabOrder={tabOrder}
          selectedTabId={selectedTabId}
          onSelectTab={handleSelectTab}
          onReorderTabs={reorderTabs}
        />
      </SortableContext>

      <div className={styles.tabContent}>
        <SortableContext items={activeSectionIds} strategy={verticalListSortingStrategy}>
          {activeSectionIds.map(sectionId => {
            const section = sections[sectionId];
            if (!section) return null;
            const sectionFieldIds = fieldOrder[sectionId] ?? [];
            const sectionFields = sectionFieldIds.map(id => fields[id]).filter(Boolean) as DesignerFieldModel[];

            return (
              <SortableContext
                key={sectionId}
                items={sectionFieldIds}
                strategy={verticalListSortingStrategy}
              >
                <SectionContainer
                  section={section}
                  fields={sectionFields}
                  fieldOrder={sectionFieldIds}
                />
              </SortableContext>
            );
          })}
        </SortableContext>

        <div className={styles.addSectionBar}>
          <Button
            appearance="subtle"
            icon={<Add24Regular />}
            onClick={handleAddSection}
            aria-label="Add Section"
          >
            Add Section
          </Button>
        </div>
      </div>
    </div>
  );
}

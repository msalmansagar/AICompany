import React from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { FormProperties } from './FormProperties';
import { TabProperties } from './TabProperties';
import { SectionProperties } from './SectionProperties';
import { FieldProperties } from './FieldProperties';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: '16px',
  },
});

export function PropertiesPanel(): React.ReactElement {
  const styles = useStyles();
  const selectedId = useDesignerStore(state => state.selectedId);
  const selectedType = useDesignerStore(state => state.selectedType);

  function renderPanelTitle(): string {
    switch (selectedType) {
      case 'form': return 'Form Properties';
      case 'tab': return 'Tab Properties';
      case 'section': return 'Section Properties';
      case 'field': return 'Field Properties';
      default: return 'Properties';
    }
  }

  function renderContent(): React.ReactElement {
    if (!selectedId || !selectedType) {
      return (
        <div className={styles.emptyState}>
          <Text size={300}>Select an element on the canvas to configure its properties</Text>
        </div>
      );
    }

    switch (selectedType) {
      case 'form':
        return <FormProperties />;
      case 'tab':
        return <TabProperties tabId={selectedId} />;
      case 'section':
        return <SectionProperties sectionId={selectedId} />;
      case 'field':
        return <FieldProperties fieldId={selectedId} />;
      default:
        return <></>;
    }
  }

  return (
    <div className={styles.panel} role="complementary" aria-label="Properties Panel">
      <div className={styles.header}>
        <Text weight="semibold" size={300}>{renderPanelTitle()}</Text>
      </div>
      <div className={styles.content}>
        {renderContent()}
      </div>
    </div>
  );
}

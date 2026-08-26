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
    width: '320px',
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
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
});

export function PropertiesPanel(): React.ReactElement | null {
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

  // Takes the id as an argument rather than closing over it: the guard below narrows it away
  // from null, and a closure defined above the guard would not see that narrowing.
  function renderContent(itemId: string): React.ReactElement {
    switch (selectedType) {
      case 'form':
        return <FormProperties />;
      case 'tab':
        return <TabProperties tabId={itemId} />;
      case 'section':
        return <SectionProperties sectionId={itemId} />;
      case 'field':
        return <FieldProperties fieldId={itemId} />;
      default:
        return <></>;
    }
  }

  // The rail is presence-based: with nothing selected its 320px belongs to the canvas
  // rather than to a message telling the user to select something.
  if (!selectedId || !selectedType) {
    return null;
  }

  return (
    <aside className={styles.panel} role="complementary" aria-label="Properties Panel">
      <div className={styles.header}>
        <Text weight="semibold" size={300}>{renderPanelTitle()}</Text>
      </div>
      <div className={styles.content}>
        {renderContent(selectedId)}
      </div>
    </aside>
  );
}

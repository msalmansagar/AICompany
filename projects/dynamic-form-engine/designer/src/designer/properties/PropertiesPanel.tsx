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
    overflowY: 'auto',
    // Nothing in the rail is wider than the rail. Fluent's Input and Select carry an
    // intrinsic min-width of roughly 150px and will not shrink below it, so any two of them
    // sharing a row — Prefix and Suffix, a grid column's label and attribute — ask for more
    // than 320px and scroll the panel sideways. Removing that floor lets them share the row
    // instead, and holds for rows added later without each one having to remember.
    overflowX: 'hidden',
    padding: '16px',
    // Applied to every descendant rather than to the controls themselves: Fluent wraps its
    // Input in a span that keeps min-width:auto, so clearing it on the input alone leaves the
    // wrapper refusing to shrink. Targeting the wrapper by its Fluent class would tie the rail
    // to internals that can be renamed; min-width:auto is the thing that has to go, wherever
    // it sits. Nothing is made smaller by this — the floor that stops shrinking is removed.
    '& *': { minWidth: 0 },
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

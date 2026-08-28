import React, { useState } from 'react';
import { makeStyles, tokens, Tab, TabList } from '@fluentui/react-components';

/** One group of related properties, shown behind its own tab. */
export interface PropertyTab {
  id: string;
  label: string;
  /** Omitted or null when this group has nothing to show for the current selection. */
  content: React.ReactNode | null;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  // The strip stays put while the group below it scrolls, so a maker never loses their place
  // in the panel to find their way back to another group.
  tabStrip: {
    flexShrink: 0,
    // Fluent's default tab padding does not fit four tabs in a 320px rail — the last one was
    // clipped mid-word. Tightened rather than scrolled: a tab a maker cannot see is a group
    // they will not know exists.
    '& [role="tab"]': { paddingLeft: '8px', paddingRight: '8px' },
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: '12px',
  },
  panel: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
});

interface PropertyTabsProps {
  tabs: PropertyTab[];
}

/**
 * Groups a properties panel into tabs.
 *
 * The panel was a single column of every section a selection could have — identity, display,
 * behaviour, type configuration, validation, mapping and translations in one run — so
 * reaching the grid column editor meant scrolling past everything else, and the editor then
 * had only the remaining height to work in.
 *
 * Groups with nothing to show are dropped rather than shown empty: a text field has no type
 * configuration, and a display-only field takes no validation. A single remaining group is
 * rendered without a strip, since a lone tab is only decoration.
 */
export function PropertyTabs({ tabs }: PropertyTabsProps): React.ReactElement {
  const styles = useStyles();
  const populated = tabs.filter(tab => tab.content !== null && tab.content !== undefined);
  const [selectedId, setSelectedId] = useState<string>(populated[0]?.id ?? '');

  // The selection can change under a maker — moving from a lookup to a text field removes the
  // configuration group — so fall back to the first group rather than rendering nothing.
  const active = populated.find(tab => tab.id === selectedId) ?? populated[0];

  if (populated.length === 0) return <></>;
  if (populated.length === 1) return <div className={styles.panel}>{populated[0].content}</div>;

  return (
    <div className={styles.root}>
      <div className={styles.tabStrip}>
        <TabList
          selectedValue={active?.id}
          onTabSelect={(_, data) => setSelectedId(data.value as string)}
          size="small"
        >
          {populated.map(tab => (
            <Tab key={tab.id} value={tab.id}>{tab.label}</Tab>
          ))}
        </TabList>
      </div>
      <div className={styles.panel} role="tabpanel">
        {active?.content}
      </div>
    </div>
  );
}

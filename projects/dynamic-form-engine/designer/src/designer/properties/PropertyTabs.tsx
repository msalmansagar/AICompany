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
    // The strip divides the width it has instead of asking for the width its labels want.
    // Four tabs sized to their text needed 297px of a 272px rail and scrolled sideways, and
    // trimming labels only postpones that until the next tab is added. Sharing the row means
    // the strip fits whatever it holds; a label with nowhere left to go is truncated rather
    // than pushing the group beside it out of reach.
    '& [role="tablist"]': { width: '100%' },
    '& [role="tab"]': {
      flex: '1 1 0',
      minWidth: 0,
      // Fluent keeps a second, bold copy of the label inside the tab to reserve the width
      // selection will need. It is not visible but it is not clipped either, so it reads as
      // content overflowing the tab and would paint outside it but for an ancestor.
      overflow: 'hidden',
      paddingLeft: '4px',
      paddingRight: '4px',
      fontSize: tokens.fontSizeBase200,
      justifyContent: 'center',
    },
    // Sized on the label itself, not the tab: Fluent sets the font on its own content span,
    // so a rule on the tab is overridden and the label keeps a width the shared row cannot
    // give it. The ellipsis is a backstop for a label longer than any used here.
    '& [role="tab"] > span': {
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: tokens.fontSizeBase200,
    },
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

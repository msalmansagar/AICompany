import React, { lazy, Suspense, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  makeStyles,
  tokens,
  Text,
  Spinner,
} from '@fluentui/react-components';
import { AppsRegular, LayoutCellFourRegular, PuzzlePieceRegular } from './fieldTypeIcons';
import { BASIC_FIELD_TYPES, LAYOUT_FIELD_TYPES, ADVANCED_FIELD_TYPES } from '@/constants/fieldTypes';
import { DraggableToolboxItem } from './DraggableToolboxItem';

const AdvancedComponentsPanel = lazy(() =>
  import('./AdvancedComponentsPanel').then(m => ({ default: m.AdvancedComponentsPanel }))
);

const useStyles = makeStyles({
  toolbox: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  categoryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    padding: '8px',
  },
  accordionHeaderContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  // Wrapper sets font-size so icon SVG (width="1em") resolves to the right size
  accordionIconWrapper: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '16px',
    color: tokens.colorBrandForeground1,
  },
});

export function ComponentToolbox(): React.ReactElement {
  const styles = useStyles();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  return (
    <div className={styles.toolbox} role="region" aria-label="Component Toolbox">
      <div className={styles.header}>
        <Text weight="semibold" size={300}>Components</Text>
      </div>

      <Accordion multiple collapsible defaultOpenItems={['basic', 'layout']}>
        <AccordionItem value="basic">
          <AccordionHeader>
            <span className={styles.accordionHeaderContent}>
              <span className={styles.accordionIconWrapper}><AppsRegular /></span>
              Basic Fields
            </span>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.categoryGrid}>
              {BASIC_FIELD_TYPES.map(fieldDef => (
                <DraggableToolboxItem key={fieldDef.type} fieldDef={fieldDef} />
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="layout">
          <AccordionHeader>
            <span className={styles.accordionHeaderContent}>
              <span className={styles.accordionIconWrapper}><LayoutCellFourRegular /></span>
              Layout
            </span>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.categoryGrid}>
              {LAYOUT_FIELD_TYPES.map(fieldDef => (
                <DraggableToolboxItem key={fieldDef.type} fieldDef={fieldDef} />
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem
          value="advanced"
          onClick={() => setAdvancedExpanded(true)}
        >
          <AccordionHeader>
            <span className={styles.accordionHeaderContent}>
              <span className={styles.accordionIconWrapper}><PuzzlePieceRegular /></span>
              Advanced
            </span>
          </AccordionHeader>
          <AccordionPanel>
            {advancedExpanded ? (
              <Suspense fallback={<Spinner size="tiny" label="Loading..." />}>
                <AdvancedComponentsPanel fieldTypes={ADVANCED_FIELD_TYPES} />
              </Suspense>
            ) : null}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

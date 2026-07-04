import React, { useState } from 'react';
import {
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ThemeStylePanel } from './ThemeStylePanel';
import { FormStylePanel } from './FormStylePanel';
import { SectionStylePanel } from './SectionStylePanel';
import { FieldStylePanel } from './FieldStylePanel';
import { ButtonStylePanel } from './ButtonStylePanel';

type StyleTabValue = 'theme' | 'form' | 'section' | 'field' | 'button';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  tabList: {
    flexShrink: 0,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingLeft: '8px',
  },
  panelArea: { flex: 1, overflow: 'auto', padding: '16px' },
  hidden: { display: 'none' },
});

interface StyleTabContainerProps {
  activeSectionId: string | null;
  activeFieldId: string | null;
}

/** Hosts all 5 style panels with deferred tab mounting — panels stay in the DOM hidden. */
export function StyleTabContainer({ activeSectionId, activeFieldId }: StyleTabContainerProps): React.ReactElement {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<StyleTabValue>('theme');
  const [mountedTabs, setMountedTabs] = useState<Set<StyleTabValue>>(new Set(['theme']));

  function handleTabSelect(tab: StyleTabValue): void {
    setSelectedTab(tab);
    setMountedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }

  function panelClass(tab: StyleTabValue): string {
    return selectedTab === tab ? styles.panelArea : `${styles.panelArea} ${styles.hidden}`;
  }

  return (
    <div className={styles.root}>
      <TabList
        className={styles.tabList}
        selectedValue={selectedTab}
        onTabSelect={(_, d) => handleTabSelect(d.value as StyleTabValue)}
        size="small"
      >
        <Tab value="theme">Theme</Tab>
        <Tab value="form">Form</Tab>
        <Tab value="section">Section</Tab>
        <Tab value="field">Field</Tab>
        <Tab value="button">Buttons</Tab>
      </TabList>

      <div className={panelClass('theme')}>
        {mountedTabs.has('theme') && <ThemeStylePanel />}
      </div>
      <div className={panelClass('form')}>
        {mountedTabs.has('form') && <FormStylePanel />}
      </div>
      <div className={panelClass('section')}>
        {mountedTabs.has('section') && <SectionStylePanel sectionId={activeSectionId} />}
      </div>
      <div className={panelClass('field')}>
        {mountedTabs.has('field') && <FieldStylePanel fieldId={activeFieldId} />}
      </div>
      <div className={panelClass('button')}>
        {mountedTabs.has('button') && <ButtonStylePanel />}
      </div>
    </div>
  );
}

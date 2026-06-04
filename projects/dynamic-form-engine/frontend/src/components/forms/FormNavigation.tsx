import {
  TabList,
  Tab,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { CheckmarkCircle20Filled } from '@fluentui/react-icons';
import type { TabDefinition } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';

const useStyles = makeStyles({
  tabList: {
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    overflowX: 'auto',
  },
  tabContent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  completionIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
});

interface FormNavigationProps {
  tabs: TabDefinition[];
  activeTabIndex: number;
  onTabChange: (index: number) => void;
}

export function FormNavigation({ tabs, activeTabIndex, onTabChange }: FormNavigationProps) {
  const styles = useStyles();
  const { formDefinition, ruleState, fieldValues, validationErrors } = useFormContext();

  const activeTabId = tabs[activeTabIndex]?.id;

  function isTabComplete(tab: TabDefinition): boolean {
    if (!formDefinition) return false;

    for (const section of tab.sections) {
      const sectionVisible = ruleState.sectionVisibility[section.id] ?? section.isVisible;
      if (!sectionVisible) continue;

      for (const field of section.fields) {
        const fieldVisible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
        if (!fieldVisible || field.isHidden) continue;

        const isRequired = ruleState.fieldRequired[field.id] ?? field.isRequired;
        if (!isRequired) continue;

        const value = fieldValues[field.schemaName];
        const isEmpty = value === null || value === undefined || value === '';
        const hasError = !!validationErrors[field.id]?.length;

        if (isEmpty || hasError) return false;
      }
    }

    return true;
  }

  function getTabErrorCount(tab: TabDefinition): number {
    let count = 0;

    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (validationErrors[field.id]?.length) count++;
      }
    }

    return count;
  }

  return (
    <nav aria-label="Form sections" className={styles.tabList}>
      <TabList selectedValue={activeTabId} appearance="subtle">
        {tabs.map((tab, index) => {
          const complete = isTabComplete(tab);
          const errorCount = getTabErrorCount(tab);

          return (
            <Tab
              key={tab.id}
              value={tab.id}
              onClick={() => onTabChange(index)}
              aria-label={`${tab.label}${complete ? ', completed' : ''}${errorCount > 0 ? `, ${errorCount} errors` : ''}`}
            >
              <span className={styles.tabContent}>
                {tab.label}
                {complete && !errorCount && (
                  <CheckmarkCircle20Filled
                    className={styles.completionIcon}
                    aria-hidden="true"
                  />
                )}
                {errorCount > 0 && (
                  <Badge
                    appearance="filled"
                    color="danger"
                    size="small"
                    aria-hidden="true"
                  >
                    {errorCount}
                  </Badge>
                )}
              </span>
            </Tab>
          );
        })}
      </TabList>
    </nav>
  );
}

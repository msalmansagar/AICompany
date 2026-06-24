import { Fragment } from 'react';
import {
  TabList,
  Tab,
  makeStyles,
  tokens,
  Badge,
  Text,
  mergeClasses,
} from '@fluentui/react-components';
import { CheckmarkCircle20Filled } from '@fluentui/react-icons';
import type { TabDefinition } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  // Horizontal tab bar (default)
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

  // Step circles (shared between sidebar and stepper)
  stepCircle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    flexShrink: 0,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  stepCircleActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    border: `1px solid ${tokens.colorBrandBackground}`,
  },
  stepCircleComplete: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    border: `1px solid ${tokens.colorPaletteGreenForeground1}`,
  },

  // Vertical sidebar nav
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    width: '220px',
    flexShrink: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    gap: tokens.spacingVerticalXS,
  },
  sidebarStep: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    width: '100%',
  },
  sidebarStepActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  sidebarLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
    flex: '1 1 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sidebarLabelActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  sidebarLabelComplete: {
    color: tokens.colorPaletteGreenForeground1,
  },
  sidebarBadge: {
    marginLeft: 'auto',
    flexShrink: 0,
  },

  // Horizontal stepper progress bar
  stepperRoot: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: `${tokens.spacingVerticalM} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    overflowX: 'auto',
  },
  stepperItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: '1 1 0',
    minWidth: '60px',
    gap: tokens.spacingVerticalXS,
  },
  stepperConnector: {
    flex: '0 0 24px',
    height: '2px',
    marginTop: '13px',
    backgroundColor: tokens.colorNeutralStroke1,
    borderRadius: '1px',
    flexShrink: 0,
  },
  stepperConnectorDone: {
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  stepperLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    lineHeight: tokens.lineHeightBase100,
    maxWidth: '80px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepperLabelActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepperLabelComplete: {
    color: tokens.colorPaletteGreenForeground1,
  },
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface FormNavigationProps {
  tabs: TabDefinition[];
  activeTabIndex: number;
  onTabChange: (index: number) => void;
}

// ── Shared tab status hook ────────────────────────────────────────────────────

export function useTabStatus() {
  const { formDefinition, ruleState, fieldValues, validationErrors } = useFormContext();

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

  return { isTabComplete, getTabErrorCount };
}

// ── Horizontal tabs (default) ─────────────────────────────────────────────────

function HorizontalTabs({ tabs, activeTabIndex, onTabChange }: FormNavigationProps) {
  const styles = useStyles();
  const { isTabComplete, getTabErrorCount } = useTabStatus();
  const activeTabId = tabs[activeTabIndex]?.id;

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
                  <Badge appearance="filled" color="danger" size="small" aria-hidden="true">
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

// ── Stepper progress indicator (non-interactive) ──────────────────────────────

function StepperProgress({ tabs, activeTabIndex }: Omit<FormNavigationProps, 'onTabChange'>) {
  const styles = useStyles();
  const { isTabComplete, getTabErrorCount } = useTabStatus();

  return (
    <nav aria-label="Form progress" className={styles.stepperRoot}>
      {tabs.map((tab, index) => {
        const isActive = index === activeTabIndex;
        const isPrevious = index < activeTabIndex;
        const complete = isPrevious && isTabComplete(tab);
        const errorCount = getTabErrorCount(tab);
        const isLast = index === tabs.length - 1;

        return (
          <Fragment key={tab.id}>
            <div
              className={styles.stepperItem}
              aria-current={isActive ? 'step' : undefined}
            >
              <div
                className={mergeClasses(
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  complete && styles.stepCircleComplete,
                )}
                aria-hidden="true"
              >
                {complete
                  ? <CheckmarkCircle20Filled style={{ width: 14, height: 14 }} />
                  : index + 1}
              </div>

              <Text
                className={mergeClasses(
                  styles.stepperLabel,
                  isActive && styles.stepperLabelActive,
                  complete && styles.stepperLabelComplete,
                )}
              >
                {tab.label}
              </Text>

              {errorCount > 0 && (
                <Badge
                  appearance="filled"
                  color="danger"
                  size="tiny"
                  aria-label={`${errorCount} error${errorCount > 1 ? 's' : ''} in ${tab.label}`}
                >
                  {errorCount}
                </Badge>
              )}
            </div>

            {!isLast && (
              <div
                className={mergeClasses(
                  styles.stepperConnector,
                  complete && styles.stepperConnectorDone,
                )}
                aria-hidden="true"
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

// ── Vertical sidebar ──────────────────────────────────────────────────────────

function SidebarNav({ tabs, activeTabIndex, onTabChange }: FormNavigationProps) {
  const styles = useStyles();
  const { isTabComplete, getTabErrorCount } = useTabStatus();

  return (
    <nav aria-label="Form sections" className={styles.sidebar}>
      {tabs.map((tab, index) => {
        const isActive = index === activeTabIndex;
        const complete = isTabComplete(tab);
        const errorCount = getTabErrorCount(tab);

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Step ${index + 1}: ${tab.label}${complete ? ', completed' : ''}${errorCount > 0 ? `, ${errorCount} errors` : ''}`}
            className={mergeClasses(styles.sidebarStep, isActive && styles.sidebarStepActive)}
            onClick={() => onTabChange(index)}
          >
            <span
              className={mergeClasses(
                styles.stepCircle,
                isActive && styles.stepCircleActive,
                !isActive && complete && styles.stepCircleComplete,
              )}
              aria-hidden="true"
            >
              {!isActive && complete
                ? <CheckmarkCircle20Filled style={{ width: 16, height: 16 }} />
                : index + 1}
            </span>

            <Text
              className={mergeClasses(
                styles.sidebarLabel,
                isActive && styles.sidebarLabelActive,
                !isActive && complete && styles.sidebarLabelComplete,
              )}
            >
              {tab.label}
            </Text>

            {errorCount > 0 && (
              <Badge
                appearance="filled"
                color="danger"
                size="small"
                className={styles.sidebarBadge}
                aria-hidden="true"
              >
                {errorCount}
              </Badge>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ── Public component — switches on tabStyle from design context ───────────────

export function FormNavigation(props: FormNavigationProps) {
  const design = useDesignContext();
  const tabStyle = design.formDesign.tabStyle;

  const activeTabHidesBar = props.tabs[props.activeTabIndex]?.hideTabBar === true;

  if (activeTabHidesBar) return null;

  if (tabStyle === 'Sidebar') return <SidebarNav {...props} />;
  if (tabStyle === 'Stepper') return <StepperProgress tabs={props.tabs} activeTabIndex={props.activeTabIndex} />;
  if (tabStyle === 'Accordion') return null;

  return <HorizontalTabs {...props} />;
}

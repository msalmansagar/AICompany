import { makeStyles, tokens } from '@fluentui/react-components';
import type { TabDefinition } from '@qdb/shared';
import { SectionRenderer } from './SectionRenderer';
import { useFormContext } from '../../contexts/FormContext';

const useStyles = makeStyles({
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
});

interface TabRendererProps {
  tab: TabDefinition;
  isVisible: boolean;
}

export function TabRenderer({ tab, isVisible }: TabRendererProps) {
  const styles = useStyles();
  const { ruleState } = useFormContext();

  if (!isVisible) return null;

  const visibleSections = tab.sections
    .filter((section) => ruleState.sectionVisibility[section.id] ?? section.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div
      role="tabpanel"
      aria-label={tab.label}
      className={styles.tabPanel}
    >
      {visibleSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isVisible={true}
        />
      ))}
    </div>
  );
}

import { makeStyles, tokens } from '@fluentui/react-components';
import type { TabDefinition } from '@qdb/shared';
import { SectionRenderer } from './SectionRenderer';
import { SaveDraftButton } from './SaveDraftButton';
import { SubmitButton } from './SubmitButton';
import { ScopedButtonBar } from './ScopedButtonBar';
import { useFormContext } from '../../contexts/FormContext';

const useStyles = makeStyles({
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  // Tab-aware button row — placed at the bottom of each tab's field list.
  tabButtonRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

interface TabRendererProps {
  tab: TabDefinition;
  isVisible: boolean;
  // Forwarded to field renderers that need lazy-loading (e.g. interactive-grid, ADR-ADD-003).
  isTabActive?: boolean;
  // Tab-aware button visibility (DFE-ADD-002, BR-025, BR-027).
  showSaveDraft?: boolean;
  showSubmit?: boolean;
}

export function TabRenderer({
  tab,
  isVisible,
  isTabActive = false,
  showSaveDraft = false,
  showSubmit = false,
}: TabRendererProps) {
  const styles = useStyles();
  const { ruleState } = useFormContext();

  if (!isVisible) return null;

  const visibleSections = tab.sections
    .filter((section) => ruleState.sectionVisibility[section.id] ?? section.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const showButtonRow = showSaveDraft || showSubmit;

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
          isTabActive={isTabActive}
        />
      ))}

      {/* DFE-BTN-001: tab-scoped buttons render below this tab's sections. */}
      <ScopedButtonBar buttons={tab.buttons} />

      {showButtonRow && (
        <div className={styles.tabButtonRow} role="group" aria-label="Tab actions">
          {/* Save & Draft is shown on every tab when allowSaveDraft is true (FR-150). */}
          {showSaveDraft && <SaveDraftButton />}
          {/*
            Submit is shown only on the final tab — enforced in DynamicFormRenderer,
            not configurable from Dataverse (BR-027).
          */}
          {showSubmit && <SubmitButton />}
        </div>
      )}
    </div>
  );
}

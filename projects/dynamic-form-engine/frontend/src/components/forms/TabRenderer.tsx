import { makeStyles, tokens } from '@fluentui/react-components';
import type { FieldDefinition, TabDefinition } from '@qdb/shared';
import { SectionRenderer } from './SectionRenderer';
import { SaveDraftButton } from './SaveDraftButton';
import { SubmitButton } from './SubmitButton';
import { ScopedButtonBar } from './ScopedButtonBar';
import { FieldRenderer } from './FieldRenderer';
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
  // DFE-FBE-001: tab description, rendered above the sections (OQ-001).
  tabDescription: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    whiteSpace: 'pre-wrap',
  },
  // DFE-TABZONE-001: header/footer field zones — a 4-column grid like sections,
  // without the section card chrome.
  zoneGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalM,
  },
  headerZone: {
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  footerZone: {
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
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

// DFE-TABZONE-001: renders a tab header/footer field zone. Mirrors the section
// field gating (visibility/required/readonly/errors) so rules apply identically
// to zone fields. Renders nothing when no zone field is visible.
function TabFieldZone({
  fields,
  wrapperClassName,
  ariaLabel,
  isTabActive,
}: {
  fields: FieldDefinition[];
  wrapperClassName: string;
  ariaLabel: string;
  isTabActive: boolean;
}) {
  const styles = useStyles();
  const { ruleState, validationErrors } = useFormContext();

  const visibleFields = fields
    .filter((field) => (ruleState.fieldVisibility[field.id] ?? field.isVisible) && !field.isHidden)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (visibleFields.length === 0) return null;

  return (
    <div className={`${styles.zoneGrid} ${wrapperClassName}`} role="group" aria-label={ariaLabel}>
      {visibleFields.map((field) => {
        const isRequired = ruleState.fieldRequired[field.id] ?? field.isRequired;
        const isReadonly = ruleState.fieldReadonly[field.id] ?? field.isReadonly;
        const errorMessage = (validationErrors[field.id] ?? [])[0];
        return (
          <div key={field.id} style={{ gridColumn: `span ${Math.min(field.columnSpan, 4)}` }}>
            <FieldRenderer
              field={field}
              isVisible={true}
              isRequired={isRequired}
              isReadonly={isReadonly}
              error={errorMessage}
              isTabActive={isTabActive}
            />
          </div>
        );
      })}
    </div>
  );
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
      {/* DFE-TABZONE-001: header-zone fields render above the description/sections. */}
      <TabFieldZone
        fields={tab.headerFields ?? []}
        wrapperClassName={styles.headerZone}
        ariaLabel={`${tab.label} header`}
        isTabActive={isTabActive}
      />

      {/* DFE-FBE-001: tab description above the sections (OQ-001). */}
      {tab.description && <div className={styles.tabDescription}>{tab.description}</div>}

      {visibleSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isVisible={true}
          isTabActive={isTabActive}
        />
      ))}

      {/* DFE-TABZONE-001: footer-zone fields render below the sections. */}
      <TabFieldZone
        fields={tab.footerFields ?? []}
        wrapperClassName={styles.footerZone}
        ariaLabel={`${tab.label} footer`}
        isTabActive={isTabActive}
      />

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

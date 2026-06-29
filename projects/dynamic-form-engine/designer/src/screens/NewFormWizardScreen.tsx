import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Combobox,
  Field,
  Input,
  Option,
  Select,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { TabService } from '@/services/TabService';
import { SectionService } from '@/services/SectionService';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { THEME_ATTRS } from '@/constants/attributeNames';
import { useDesignerStore } from '@/state/designerStore';
import type {
  DesignerFormModel,
  DesignerTabModel,
  DesignerSectionModel,
} from '@/state/models/DesignerFormModel';
import { DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';

const TOTAL_STEPS = 5;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '8px',
    boxShadow: tokens.shadow16,
    padding: '40px',
    width: '520px',
    maxWidth: '90vw',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '32px',
  },
  stepDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    flexShrink: 0,
  },
  stepDotActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotInactive: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  stepConnector: {
    flex: 1,
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
    maxWidth: '48px',
  },
  stepConnectorCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepTitle: {
    marginBottom: '24px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '32px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  summaryLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
  summaryValue: {
    fontWeight: 600,
    fontSize: '13px',
  },
  columnOption: {
    display: 'flex',
    gap: '12px',
  },
  columnButton: {
    flex: 1,
    padding: '12px',
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'center' as const,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: '14px',
    transition: 'border-color 0.15s',
  },
  columnButtonSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '13px',
    marginTop: '8px',
  },
});

interface ThemeOption {
  id: string;
  name: string;
}

interface EntityOption {
  logicalName: string;
  displayName: string;
}

interface WizardState {
  name: string;
  code: string;
  description: string;
  tabCount: number;
  columnLayout: 1 | 2 | 3;
  entityLogicalName: string;
  themeId: string | null;
}

const INITIAL_STATE: WizardState = {
  name: '',
  code: '',
  description: '',
  tabCount: 1,
  columnLayout: 1,
  entityLogicalName: '',
  themeId: null,
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function WizardStepIndicator({ currentStep }: { currentStep: number }): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.stepIndicator} role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const stepNumber = i + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <React.Fragment key={stepNumber}>
            {i > 0 && (
              <div className={`${styles.stepConnector} ${isCompleted ? styles.stepConnectorCompleted : ''}`} />
            )}
            <div
              className={`${styles.stepDot} ${
                isActive ? styles.stepDotActive : isCompleted ? styles.stepDotCompleted : styles.stepDotInactive
              }`}
              aria-label={`Step ${stepNumber}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
            >
              {isCompleted ? <CheckmarkRegular fontSize={14} /> : stepNumber}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Form Basics
// ---------------------------------------------------------------------------

function StepFormBasics({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }): React.ReactElement {
  const styles = useStyles();

  function handleNameChange(_: React.ChangeEvent<HTMLInputElement>, data: { value: string }): void {
    const autoCode = data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    onChange({ name: data.value, code: state.code || autoCode });
  }

  function handleCodeChange(_: React.ChangeEvent<HTMLInputElement>, data: { value: string }): void {
    onChange({ code: data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') });
  }

  return (
    <div className={styles.form}>
      <Field label="Form Name" required>
        <Input value={state.name} onChange={handleNameChange} placeholder="e.g. Loan Application Form" autoFocus />
      </Field>
      <Field label="Form Code" required hint="Lowercase letters, numbers, and underscores only.">
        <Input value={state.code} onChange={handleCodeChange} placeholder="e.g. loan_application" style={{ fontFamily: 'monospace' }} />
      </Field>
      <Field label="Description">
        <Textarea
          value={state.description}
          onChange={(_, data) => onChange({ description: data.value })}
          placeholder="Describe the purpose of this form..."
          rows={3}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Initial Structure
// ---------------------------------------------------------------------------

function StepInitialStructure({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.form}>
      <Field label="Number of Initial Tabs">
        <Select
          value={String(state.tabCount)}
          onChange={(_, data) => onChange({ tabCount: parseInt(data.value, 10) })}
        >
          {[1, 2, 3, 4, 5].map(n => (
            <option key={n} value={String(n)}>{n} Tab{n > 1 ? 's' : ''}</option>
          ))}
        </Select>
      </Field>
      <Field label="Default Column Layout">
        <div className={styles.columnOption}>
          {([1, 2, 3] as const).map(col => (
            <button
              key={col}
              type="button"
              className={`${styles.columnButton} ${state.columnLayout === col ? styles.columnButtonSelected : ''}`}
              onClick={() => onChange({ columnLayout: col })}
              aria-pressed={state.columnLayout === col}
            >
              {col} {col === 1 ? 'Column' : 'Columns'}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Target Entity (searchable dropdown from Dataverse metadata)
// ---------------------------------------------------------------------------

function StepTargetEntity({
  state,
  onChange,
  entities,
  isLoadingEntities,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  entities: EntityOption[];
  isLoadingEntities: boolean;
}): React.ReactElement {
  const styles = useStyles();
  const [query, setQuery] = useState(state.entityLogicalName);

  const filtered = query.length >= 1
    ? entities.filter(e =>
        e.logicalName.includes(query.toLowerCase()) ||
        e.displayName.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 50)
    : entities.slice(0, 50);

  return (
    <div className={styles.form}>
      <Field
        label="Target CRM Entity"
        hint="The Dataverse table where form submissions will be stored."
      >
        {isLoadingEntities ? (
          <Spinner size="tiny" label="Loading entities..." />
        ) : (
          <Combobox
            value={query}
            onInput={e => setQuery((e.target as HTMLInputElement).value)}
            onOptionSelect={(_, data) => {
              const selected = data.optionValue ?? '';
              setQuery(selected);
              onChange({ entityLogicalName: selected });
            }}
            placeholder="Search or type entity name (e.g. contact)"
            freeform
            style={{ width: '100%' }}
          >
            {filtered.map(e => (
              <Option key={e.logicalName} value={e.logicalName} text={e.logicalName}>
                {e.displayName} <span style={{ color: tokens.colorNeutralForeground3, fontSize: '12px' }}>({e.logicalName})</span>
              </Option>
            ))}
          </Combobox>
        )}
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Theme Selection (loaded from qdb_theme)
// ---------------------------------------------------------------------------

function StepThemeSelection({
  state,
  onChange,
  themes,
  isLoadingThemes,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  themes: ThemeOption[];
  isLoadingThemes: boolean;
}): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.form}>
      <Field label="Theme" hint="You can change or customize the theme later in the Theme Editor.">
        {isLoadingThemes ? (
          <Spinner size="tiny" label="Loading themes..." />
        ) : (
          <Select
            value={state.themeId ?? 'none'}
            onChange={(_, data) => onChange({ themeId: data.value === 'none' ? null : data.value })}
          >
            <option value="none">No Theme (Default)</option>
            {themes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Review
// ---------------------------------------------------------------------------

function StepReview({ state, themes }: { state: WizardState; themes: ThemeOption[] }): React.ReactElement {
  const styles = useStyles();
  const themeName = state.themeId ? (themes.find(t => t.id === state.themeId)?.name ?? state.themeId) : 'Default';

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Form Name', value: state.name },
    { label: 'Form Code', value: state.code || '(not set)' },
    { label: 'Description', value: state.description || '(none)' },
    { label: 'Initial Tabs', value: String(state.tabCount) },
    { label: 'Column Layout', value: `${state.columnLayout} Column${state.columnLayout > 1 ? 's' : ''}` },
    { label: 'Target Entity', value: state.entityLogicalName || '(not set)' },
    { label: 'Theme', value: themeName },
  ];

  return (
    <div>
      {rows.map(row => (
        <div key={row.label} className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{row.label}</span>
          <span className={styles.summaryValue}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export function NewFormWizardScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);
  const { navigateTo, loadForm } = useDesignerStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [wizardState, setWizardState] = useState<WizardState>(INITIAL_STATE);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);

  // Load themes from CRM
  useEffect(() => {
    if (!crmService) return;
    setIsLoadingThemes(true);
    const webApi = crmService.getWebApi();
    webApi
      .retrieveMultipleRecords(
        ENTITY_NAMES.THEME,
        `?$select=${THEME_ATTRS.ID},${THEME_ATTRS.NAME}&$orderby=${THEME_ATTRS.NAME} asc`
      )
      .then(result => {
        setThemes(
          result.entities.map(r => ({
            id: String(r[THEME_ATTRS.ID] ?? ''),
            name: String(r[THEME_ATTRS.NAME] ?? '(Unnamed)'),
          }))
        );
      })
      .catch(() => {
        // Themes table may be empty — not a blocking error
      })
      .finally(() => setIsLoadingThemes(false));
  }, [crmService]);

  // Load entity metadata from Dataverse API
  useEffect(() => {
    if (!crmService) return;
    setIsLoadingEntities(true);
    const clientUrl = crmService.getClientUrl();
    // EntityDefinitions is a metadata endpoint — Xrm.WebApi does not expose it,
    // so a credentialed fetch to the same CRM origin is the only supported approach.
    const url = `${clientUrl}/api/data/v9.1/EntityDefinitions?$select=LogicalName,DisplayName&$filter=IsValidForAdvancedFind eq true&$orderby=LogicalName`;
    fetch(url, { credentials: 'include', headers: { Accept: 'application/json', 'OData-Version': '4.0' } })
      .then(r => {
        if (!r.ok) throw new Error(`EntityDefinitions request failed: ${r.status}`);
        return r.json() as Promise<{ value: Array<{ LogicalName: string; DisplayName: { UserLocalizedLabel?: { Label?: string } } }> }>;
      })
      .then((data) => {
        setEntities(
          data.value.map(e => ({
            logicalName: e.LogicalName,
            displayName: e.DisplayName?.UserLocalizedLabel?.Label ?? e.LogicalName,
          }))
        );
      })
      .catch(() => {
        // Metadata API unavailable outside CRM context — user can type the entity name manually
        setEntities([]);
      })
      .finally(() => setIsLoadingEntities(false));
  }, [crmService]);

  const handleChange = useCallback((patch: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...patch }));
  }, []);

  const handleBack = useCallback(() => {
    if (currentStep === 1) navigateTo('form-list');
    else setCurrentStep(prev => prev - 1);
  }, [currentStep, navigateTo]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS) setCurrentStep(prev => prev + 1);
  }, [currentStep]);

  const handleCreate = useCallback(async () => {
    if (!crmService) return;
    setIsCreating(true);
    setCreateError(null);

    try {
      const webApi = crmService.getWebApi();
      const formService = new FormDefinitionService(webApi);
      const tabService = new TabService(webApi);
      const sectionService = new SectionService(webApi);
      // Step 1: Create form definition
      const newFormId = await formService.createForm({
        name: wizardState.name.trim(),
        code: wizardState.code.trim(),
        description: wizardState.description.trim(),
        entityLogicalName: wizardState.entityLogicalName.trim(),
        themeId: wizardState.themeId,
      });

      // Step 2: Create tabs + one section per tab
      const createdTabs: DesignerTabModel[] = [];
      const createdSections: DesignerSectionModel[] = [];

      for (let i = 0; i < wizardState.tabCount; i++) {
        const tabId = await tabService.createTab({
          formId: newFormId,
          label: `Tab ${i + 1}`,
          sortOrder: i,
          iconName: null,
          isVisible: true,
          requiresPreviousTabComplete: false,
        });

        createdTabs.push({
          id: tabId,
          formId: newFormId,
          label: `Tab ${i + 1}`,
          iconName: null,
          sortOrder: i,
          isVisible: true,
          requiresPreviousTabComplete: false,
          hideTabBar: false,
        });

        const sectionId = await sectionService.createSection({
          tabId,
          label: 'Section 1',
          description: null,
          columnCount: wizardState.columnLayout,
          isCollapsible: false,
          isExpandedByDefault: true,
          isVisible: true,
          sortOrder: 0,
        });

        createdSections.push({
          id: sectionId,
          tabId,
          label: 'Section 1',
          description: null,
          columnCount: wizardState.columnLayout,
          isCollapsible: false,
          isExpandedByDefault: true,
          isVisible: true,
          sortOrder: 0,
        });
      }

      // Step 3: Submission mappings are configured per-field in the Submission Mapping screen.
      // No auto-created blank mapping here — the old stub produced invalid CRM records.

      // Step 4: Build the form model and load into designer with real IDs
      const newForm: DesignerFormModel = {
        id: newFormId,
        name: wizardState.name.trim(),
        code: wizardState.code.trim(),
        description: wizardState.description.trim(),
        entityLogicalName: wizardState.entityLogicalName.trim(),
        status: 'draft',
        currentVersion: '1',
        themeId: wizardState.themeId,
        allowSaveDraft: true,
        draftExpiryDays: null,
        showSummaryStep: false,
        powerAutomateFlowId: null,
        confirmationMessage: null,
        confirmationRecordRefAttribute: null,
        accessGroupId: null,
        createdBy: crmService.getUserContext().userFullName,
        createdOn: new Date(),
        modifiedBy: crmService.getUserContext().userFullName,
        modifiedOn: new Date(),
      };

      loadForm(newForm, createdTabs, createdSections, [], [], [], DEFAULT_DESIGN_PAYLOAD);
      navigateTo('designer');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create form. Please try again.');
      setIsCreating(false);
    }
  }, [crmService, wizardState, loadForm, navigateTo]);

  function isStepValid(step: number): boolean {
    if (step === 1) return wizardState.name.trim().length > 0 && wizardState.code.trim().length > 0;
    return true;
  }

  function renderStepTitle(): { title: string; subtitle: string } {
    switch (currentStep) {
      case 1: return { title: 'Form Basics', subtitle: 'Set the name and code for your new form.' };
      case 2: return { title: 'Initial Structure', subtitle: 'Choose the starting layout for your form.' };
      case 3: return { title: 'Target Entity', subtitle: 'Map submissions to a CRM table.' };
      case 4: return { title: 'Theme', subtitle: 'Apply a visual style to your form.' };
      case 5: return { title: 'Review', subtitle: 'Confirm your settings before creating.' };
      default: return { title: '', subtitle: '' };
    }
  }

  function renderStepContent(): React.ReactElement {
    switch (currentStep) {
      case 1: return <StepFormBasics state={wizardState} onChange={handleChange} />;
      case 2: return <StepInitialStructure state={wizardState} onChange={handleChange} />;
      case 3: return (
        <StepTargetEntity
          state={wizardState}
          onChange={handleChange}
          entities={entities}
          isLoadingEntities={isLoadingEntities}
        />
      );
      case 4: return (
        <StepThemeSelection
          state={wizardState}
          onChange={handleChange}
          themes={themes}
          isLoadingThemes={isLoadingThemes}
        />
      );
      case 5: return <StepReview state={wizardState} themes={themes} />;
      default: return <></>;
    }
  }

  const { title, subtitle } = renderStepTitle();

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <WizardStepIndicator currentStep={currentStep} />

        <div className={styles.stepTitle}>
          <Text as="h2" size={500} weight="semibold" block>{title}</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>{subtitle}</Text>
        </div>

        {renderStepContent()}

        {createError && (
          <div className={styles.errorText} role="alert">{createError}</div>
        )}

        <div className={styles.actions}>
          <Button appearance="subtle" onClick={handleBack} disabled={isCreating}>
            {currentStep === 1 ? 'Cancel' : 'Back'}
          </Button>

          {currentStep < TOTAL_STEPS ? (
            <Button appearance="primary" onClick={handleNext} disabled={!isStepValid(currentStep)}>
              Next
            </Button>
          ) : (
            <Button
              appearance="primary"
              onClick={() => void handleCreate()}
              disabled={isCreating}
              icon={isCreating ? <Spinner size="tiny" /> : undefined}
            >
              {isCreating ? 'Creating...' : 'Create Form'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

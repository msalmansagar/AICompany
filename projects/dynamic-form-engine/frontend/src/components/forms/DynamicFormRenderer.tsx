import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBar,
  MessageBarBody,
  SkeletonItem,
  Skeleton,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  CheckmarkCircleRegular,
  SaveRegular,
  SendRegular,
} from '@fluentui/react-icons';
import { FormProvider, useFormContext } from '../../contexts/FormContext';
import { DesignContext, DEFAULT_DESIGN_PAYLOAD } from '../../contexts/DesignContext';
import { useLanguageContext, LanguageToggle } from '../../i18n';
import { ResponsiveEngine } from '../../contexts/ResponsiveContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { sanitiseCustomCssForRuntime } from '../../theme/customCssInjector';
import { FormNavigation } from './FormNavigation';
import { TabRenderer } from './TabRenderer';
import { getAllTabFields } from './tabFields';
import { evaluateTabConfirmation } from './tabConfirmation';
import { FormMark } from './FormMark';
import { FormProgressBar } from './FormProgressBar';
import { FormActionBar } from './FormActionBar';
import { FormSummary } from './FormSummary';
import { FormConfirmation } from './FormConfirmation';
import { AppearancePicker } from './AppearancePicker';
import { useAppearance } from '../../theme/AppearanceProvider';
import { InfoCardFlow } from './info-card/InfoCardFlow';
import { isBuiltInDefaultTheme } from '../../theme/themes';
import { appearanceThemeDefinition } from '@qdb/shared';
import type { DesignPayload, TabDefinition } from '@qdb/shared';

// BC-008: debounce delay for finalTabId recomputation when tab visibility changes.
const FINAL_TAB_DEBOUNCE_MS = 300;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxWidth: '960px',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
  },
  // Sidebar layout: nav rail on left, content area on right
  sidebarRoot: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: '1100px',
    margin: '0 auto',
    minHeight: '100vh',
  },
  sidebarContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    minWidth: 0,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    maxWidth: '960px',
    margin: '0 auto',
  },
  tabContent: {
    flex: '1 1 auto',
  },
  actionBar: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  title: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    margin: 0,
  },
  description: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    flex: '1 1 auto',
  },
  accordionHeaderContent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: '1 1 auto',
  },
});

// ── Phase state machine ────────────────────────────────────────────────────

type FormPhase = 'info-cards' | 'form' | 'summary';

interface PhaseState {
  phase: FormPhase;
  screenIndex: number;
}

type PhaseAction =
  | { type: 'NEXT'; totalScreens: number }
  | { type: 'BACK' }
  | { type: 'SKIP' }
  | { type: 'DRAFT_RESUME' }
  | { type: 'SHOW_INFO_CARDS' }
  | { type: 'ENTER_SUMMARY' }
  | { type: 'EXIT_SUMMARY' };

function phaseReducer(state: PhaseState, action: PhaseAction): PhaseState {
  switch (action.type) {
    case 'NEXT':
      if (
        state.phase === 'info-cards' &&
        state.screenIndex < action.totalScreens - 1
      ) {
        return { ...state, screenIndex: state.screenIndex + 1 };
      }
      return { phase: 'form', screenIndex: 0 };

    case 'BACK':
      if (state.phase === 'info-cards' && state.screenIndex > 0) {
        return { ...state, screenIndex: state.screenIndex - 1 };
      }
      return state;

    case 'SKIP':
    case 'DRAFT_RESUME':
      return { phase: 'form', screenIndex: 0 };

    case 'SHOW_INFO_CARDS':
      return { phase: 'info-cards', screenIndex: 0 };

    case 'ENTER_SUMMARY':
      return { phase: 'summary', screenIndex: 0 };

    case 'EXIT_SUMMARY':
      return { phase: 'form', screenIndex: 0 };

    default:
      return state;
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

interface DynamicFormRendererProps {
  formCode: string;
  recordId?: string;
}

export function DynamicFormRenderer({
  formCode,
  recordId,
}: DynamicFormRendererProps) {
  // Read the active language from the LanguageProvider tree.
  // useLanguageContext will throw if LanguageProvider is absent — which is the
  // correct fail-fast behaviour since main.tsx wraps everything in LanguageProvider.
  const { language, supportedLanguages, setLanguage } = useLanguageContext();

  return (
    <FormProvider formCode={formCode} recordId={recordId} lang={language}>
      <FormRendererInner
        supportedLanguages={supportedLanguages}
        activeLanguage={language}
        onLanguageSelect={setLanguage}
      />
    </FormProvider>
  );
}

function resolveFormMargin(alignment: string | undefined): string {
  if (alignment === 'Left') return '0 auto 0 0';
  if (alignment === 'Right') return '0 0 0 auto';
  return '0 auto'; // Center (default)
}

interface FormRendererInnerProps {
  supportedLanguages: import('@qdb/shared').LanguageConfig[];
  activeLanguage: string;
  onLanguageSelect: (code: string) => void;
}

function FormRendererInner({
  supportedLanguages,
  activeLanguage,
  onLanguageSelect,
}: FormRendererInnerProps) {
  const styles = useStyles();
  const {
    formDefinition,
    isLoading,
    error,
    ruleState,
    activeTabIndex,
    setActiveTabIndex,
    isSubmitted,
    submissionReference,
    draftId,
    validationErrors,
    tabAcknowledgements,
  } = useFormContext();

  // ADD-001-C2: detect draft resume — draftId present means skip info cards.
  const urlParams = new URLSearchParams(window.location.search);
  const hasDraftInUrl = urlParams.has('draftId') || !!draftId;

  // Phase always starts as 'form'. Once the form definition loads we decide whether
  // to show info-cards first. Using a ref ensures we only dispatch once per form load.
  const [phaseState, dispatchPhase] = useReducer(phaseReducer, {
    phase: 'form',
    screenIndex: 0,
  });
  const phaseDecidedRef = useRef(false);

  useEffect(() => {
    if (!formDefinition || phaseDecidedRef.current) return;
    phaseDecidedRef.current = true;

    if (!hasDraftInUrl && (formDefinition.infoCards?.length ?? 0) > 0) {
      dispatchPhase({ type: 'SHOW_INFO_CARDS' });
    }
  }, [formDefinition, hasDraftInUrl]);

  const { appearance } = useAppearance();

  const design = useMemo<DesignPayload>(() => {
    return formDefinition?.design ?? DEFAULT_DESIGN_PAYLOAD;
  }, [formDefinition]);

  // A form the customer has themed keeps its branding in every appearance — that
  // is the point of authoring one. A form that never was falls back to a built-in
  // default, and those follow the chosen appearance rather than staying light
  // inside a dark application.
  const resolvedTheme = useMemo(() => {
    const customerTheme = design.theme;
    return isBuiltInDefaultTheme(customerTheme)
      ? appearanceThemeDefinition(appearance)
      : customerTheme;
  }, [design.theme, appearance]);

  // Custom CSS injection.
  useEffect(() => {
    const css = design.formDesign.customCss;
    let el = document.getElementById('dfe-custom-css') as HTMLStyleElement | null;

    if (!css) {
      el?.remove();
      return;
    }

    if (!el) {
      el = document.createElement('style');
      el.id = 'dfe-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = sanitiseCustomCssForRuntime(css);

    return () => {
      document.getElementById('dfe-custom-css')?.remove();
    };
  }, [design.formDesign.customCss]);

  // ── finalTabId computation with BC-008 debounce ──────────────────────────
  const [finalTabId, setFinalTabId] = useState<string | null>(null);
  const finalTabDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formDefinition) return;

    // Cancel pending recomputation before scheduling a new one.
    if (finalTabDebounceRef.current) {
      clearTimeout(finalTabDebounceRef.current);
    }

    // BC-008: 300ms debounce on finalTabId recomputation triggered by visibility changes.
    finalTabDebounceRef.current = setTimeout(() => {
      const visibleTabs = formDefinition.tabs
        .filter(
          (tab: TabDefinition) =>
            ruleState.tabVisibility[tab.id] ?? tab.isVisible,
        )
        .sort((a: TabDefinition, b: TabDefinition) => a.displayOrder - b.displayOrder);

      if (visibleTabs.length === 0) {
        setFinalTabId(null);
        return;
      }

      const lastTab = visibleTabs.reduce(
        (acc: TabDefinition, tab: TabDefinition) =>
          tab.displayOrder > acc.displayOrder ? tab : acc,
      );

      setFinalTabId(lastTab.id);
    }, FINAL_TAB_DEBOUNCE_MS);

    return () => {
      if (finalTabDebounceRef.current) {
        clearTimeout(finalTabDebounceRef.current);
      }
    };
  }, [formDefinition, ruleState.tabVisibility]);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer} aria-busy="true" aria-label="Loading form">
        <Skeleton>
          <SkeletonItem size={32} />
          <SkeletonItem size={16} style={{ marginTop: tokens.spacingVerticalS }} />
          <SkeletonItem size={128} style={{ marginTop: tokens.spacingVerticalL }} />
          <SkeletonItem size={128} style={{ marginTop: tokens.spacingVerticalS }} />
          <SkeletonItem size={64} style={{ marginTop: tokens.spacingVerticalS }} />
        </Skeleton>
      </div>
    );
  }

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    );
  }

  if (!formDefinition) {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>Form definition not found.</MessageBarBody>
      </MessageBar>
    );
  }

  if (isSubmitted) {
    return (
      <FormConfirmation
        confirmationMessage={formDefinition.confirmationMessage}
        referenceNumber={submissionReference}
      />
    );
  }

  const visibleTabs = formDefinition.tabs
    .filter((tab) => ruleState.tabVisibility[tab.id] ?? tab.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const activeTab = visibleTabs[activeTabIndex] ?? visibleTabs[0];
  // DFE-SUBMITCONFIRM-002: gates derived from the tabs that require an acknowledgement.
  const { canLeaveTab, isSubmitBlocked: isSubmitBlockedByTabGate } =
    evaluateTabConfirmation(visibleTabs, tabAcknowledgements);
  const isStickyBar = design.formDesign.stickyActionBar;

  const isOnFinalTab =
    activeTab !== undefined && finalTabId !== null && activeTab.id === finalTabId;

  // DFE-FBE-001: effective summary mode — honour summaryMode, else derive from the legacy
  // boolean (back-compat). SystemGenerated → the auto review step; None/Manual → no auto step
  // (Manual's designer-built summary tab is Wave 2, C-001-gated).
  const effectiveSummaryMode =
    formDefinition.summaryMode ?? (formDefinition.showSummaryStep ? 'SystemGenerated' : 'None');
  const showSummaryStep = effectiveSummaryMode === 'SystemGenerated';
  const isSummaryPhase = phaseState.phase === 'summary';
  const tabStyle = design.formDesign.tabStyle;
  const isAccordionNav = tabStyle === 'Accordion';
  const isStepperNav = tabStyle === 'Stepper';
  const isSidebarNav = tabStyle === 'Sidebar';

  const formHeader = (
    <>
    <header className={styles.header}>
      <FormMark
        imageUrl={formDefinition.imageUrl}
        iconName={formDefinition.iconName}
        formTitle={formDefinition.title}
      />
      <div className={styles.headerText}>
        <h1 className={styles.title}>{formDefinition.title}</h1>
        {formDefinition.description && (
          <p className={styles.description}>{formDefinition.description}</p>
        )}
      </div>
      {/* Controls group: language toggle (OQ-001) + theme switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <LanguageToggle
          languages={supportedLanguages}
          activeLanguage={activeLanguage}
          onSelect={onLanguageSelect}
        />
        <AppearancePicker />
      </div>
    </header>
    {/* DFE-FBE-002: completion progress bar, above the tab strip (gated on showProgressBar). */}
    {formDefinition.showProgressBar && <FormProgressBar />}
    </>
  );

  const formNav = (
    <FormNavigation
      tabs={visibleTabs}
      activeTabIndex={activeTabIndex}
      onTabChange={setActiveTabIndex}
    />
  );

  const formTabContent = (
    <div className={styles.tabContent}>
      {isSummaryPhase ? (
        <FormSummary
          onEditTab={(tabIndex) => {
            dispatchPhase({ type: 'EXIT_SUMMARY' });
            setActiveTabIndex(tabIndex);
          }}
        />
      ) : (
        activeTab && (
          <TabRenderer
            key={activeTab.id}
            tab={activeTab}
            isVisible={true}
            isTabActive={true}
          />
        )
      )}
    </div>
  );

  const standardFormStyle = {
    maxWidth: design.formDesign.maxWidth ?? '960px',
    margin: resolveFormMargin(design.formDesign.alignment),
    fontFamily: resolvedTheme.fontFamily,
    fontSize: resolvedTheme.baseFontSize,
  };

  const accordionContent = (
    <Accordion
      openItems={activeTab ? [activeTab.id] : []}
      onToggle={(_, data) => {
        const idx = visibleTabs.findIndex(t => t.id === String(data.value));
        if (idx >= 0) setActiveTabIndex(idx);
      }}
    >
      {visibleTabs.map((tab) => {
        const tabErrorCount = getAllTabFields(tab)
          .reduce((n, f) => n + (validationErrors[f.id]?.length ?? 0), 0);
        const isTabOpen = activeTab?.id === tab.id;

        return (
          <AccordionItem key={tab.id} value={tab.id}>
            <AccordionHeader>
              <span className={styles.accordionHeaderContent}>
                <Text weight={isTabOpen ? 'semibold' : 'regular'}>{tab.label}</Text>
                {tabErrorCount > 0 && (
                  <Badge appearance="filled" color="danger" size="small" aria-hidden="true">
                    {tabErrorCount}
                  </Badge>
                )}
              </span>
            </AccordionHeader>
            <AccordionPanel>
              <TabRenderer
                key={tab.id}
                tab={tab}
                isVisible={true}
                isTabActive={isTabOpen}
              />
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );

  const renderFormBody = () => {
    if (phaseState.phase === 'info-cards') {
      return (
        <InfoCardFlow
          formDefinition={formDefinition}
          onComplete={() => dispatchPhase({ type: 'SKIP' })}
        />
      );
    }

    // Summary phase: same layout regardless of nav style.
    if (isSummaryPhase) {
      return (
        <main className={styles.root} aria-label={formDefinition.title} style={standardFormStyle}>
          {formHeader}
          {formTabContent}
          <SummaryActionBar
            sticky={isStickyBar}
            onBack={() => dispatchPhase({ type: 'EXIT_SUMMARY' })}
          />
        </main>
      );
    }

    if (isAccordionNav) {
      return (
        <main className={styles.root} aria-label={formDefinition.title} style={standardFormStyle}>
          {formHeader}
          {accordionContent}
          <FormActionBar
            sticky={isStickyBar}
            showSubmit={true}
            reviewMode={showSummaryStep}
            onReview={() => dispatchPhase({ type: 'ENTER_SUMMARY' })}
          />
        </main>
      );
    }

    if (isSidebarNav) {
      return (
        <main
          className={styles.sidebarRoot}
          aria-label={formDefinition.title}
          style={{ fontFamily: resolvedTheme.fontFamily, fontSize: resolvedTheme.baseFontSize }}
        >
          {formNav}
          <div className={styles.sidebarContent}>
            {formHeader}
            {formTabContent}
            <FormActionBar
              sticky={isStickyBar}
              showSubmit={isOnFinalTab}
              reviewMode={isOnFinalTab && showSummaryStep}
              onReview={() => dispatchPhase({ type: 'ENTER_SUMMARY' })}
            />
          </div>
        </main>
      );
    }

    if (isStepperNav) {
      return (
        <main className={styles.root} aria-label={formDefinition.title} style={standardFormStyle}>
          {formHeader}
          {formNav}
          {formTabContent}
          <StepperActionBar
            sticky={isStickyBar}
            activeTabIndex={activeTabIndex}
            isOnFinalTab={isOnFinalTab}
            showSummaryStep={showSummaryStep}
            currentTab={activeTab}
            canLeaveCurrentTab={canLeaveTab(activeTab)}
            isSubmitBlockedByTabGate={isSubmitBlockedByTabGate}
            onBack={() => setActiveTabIndex(Math.max(0, activeTabIndex - 1))}
            onNext={() => setActiveTabIndex(Math.min(visibleTabs.length - 1, activeTabIndex + 1))}
            onReview={() => dispatchPhase({ type: 'ENTER_SUMMARY' })}
          />
        </main>
      );
    }

    // Default: horizontal tabs
    return (
      <main className={styles.root} aria-label={formDefinition.title} style={standardFormStyle}>
        {formHeader}
        {formNav}
        {formTabContent}
        <FormActionBar
          sticky={isStickyBar}
          showSubmit={isOnFinalTab}
          reviewMode={isOnFinalTab && showSummaryStep}
          onReview={() => dispatchPhase({ type: 'ENTER_SUMMARY' })}
        />
      </main>
    );
  };

  return (
    <ResponsiveEngine>
      <ThemeProvider theme={resolvedTheme}>
        <DesignContext.Provider value={design}>
          {renderFormBody()}
        </DesignContext.Provider>
      </ThemeProvider>
    </ResponsiveEngine>
  );
}

// ── Summary phase action bar ───────────────────────────────────────────────

interface SummaryActionBarProps {
  sticky: boolean;
  onBack: () => void;
}

const useSummaryBarStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
  },
  sticky: {
    position: 'sticky',
    bottom: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    zIndex: 100,
  },
});

function SummaryActionBar({ sticky, onBack }: SummaryActionBarProps) {
  const styles = useSummaryBarStyles();
  const {
    submitForm,
    isSubmitting,
    validationErrors,
    formDefinition,
    submitAcknowledged,
    setSubmitAcknowledged,
    tabAcknowledgements,
    ruleState,
  } = useFormContext();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const errorCount = Object.values(validationErrors).reduce((n, errs) => n + errs.length, 0);

  // DFE-SUBMITCONFIRM-001: acknowledgement gate on the manual summary's submit.
  const confirmation = formDefinition?.submitConfirmation;
  // DFE-SUBMITCONFIRM-002: the summary is reached past every tab, so any tab gate the user
  // never satisfied — a tab a jump-to-tab button skipped — still blocks here.
  const visibleTabs = (formDefinition?.tabs ?? [])
    .filter((tab) => ruleState.tabVisibility[tab.id] ?? tab.isVisible);
  const { unacknowledgedTabs } = evaluateTabConfirmation(visibleTabs, tabAcknowledgements);

  const submitBlocked = (!!confirmation && !submitAcknowledged) || unacknowledgedTabs.length > 0;

  function handleAcknowledgementChange(checked: boolean) {
    setSubmitAcknowledged(checked);
    if (checked) setConfirmDialogOpen(true);
  }

  const bar = (
    <div
      className={mergeClasses(styles.bar, sticky && styles.sticky)}
      role="toolbar"
      aria-label="Summary actions"
    >
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={onBack}
        disabled={isSubmitting}
      >
        Edit Responses
      </Button>

      {/*
        A gate the user never saw would otherwise disable Submit with no explanation, so
        name the tabs that still need acknowledging.
      */}
      {unacknowledgedTabs.length > 0 && (
        <Text size={200} role="status" style={{ color: tokens.colorPaletteRedForeground1 }}>
          {`Confirm before submitting: ${unacknowledgedTabs.map((tab) => tab.label).join(', ')}`}
        </Text>
      )}

      <Button
        appearance="primary"
        icon={isSubmitting ? <Spinner size="tiny" /> : <SendRegular />}
        disabled={isSubmitting || errorCount > 0 || submitBlocked}
        onClick={() => { void submitForm(); }}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </Button>
    </div>
  );

  if (!confirmation) return bar;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Checkbox
          checked={submitAcknowledged}
          onChange={(_, data) => handleAcknowledgementChange(data.checked === true)}
          label={confirmation.checkboxLabel}
          disabled={isSubmitting}
        />
      </div>
      <Dialog open={confirmDialogOpen} onOpenChange={(_, data) => setConfirmDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Please confirm</DialogTitle>
            <DialogContent>
              {confirmation.dialogMessage ?? 'Please confirm you want to submit this form.'}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary">OK</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {bar}
    </div>
  );
}

// ── Stepper action bar ─────────────────────────────────────────────────────

interface StepperActionBarProps {
  sticky: boolean;
  activeTabIndex: number;
  isOnFinalTab: boolean;
  showSummaryStep: boolean;
  // DFE-SUBMITCONFIRM-002: the tab in view, and the two gates derived from tab acknowledgements.
  currentTab: TabDefinition | undefined;
  canLeaveCurrentTab: boolean;
  isSubmitBlockedByTabGate: boolean;
  onBack: () => void;
  onNext: () => void;
  onReview: () => void;
}

const useStepperBarStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  sticky: {
    position: 'sticky',
    bottom: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    zIndex: 100,
  },
});

function StepperActionBar({
  sticky,
  activeTabIndex,
  isOnFinalTab,
  showSummaryStep,
  currentTab,
  canLeaveCurrentTab,
  isSubmitBlockedByTabGate,
  onBack,
  onNext,
  onReview,
}: StepperActionBarProps) {
  const styles = useStepperBarStyles();
  const { submitForm, saveDraft, isDirty, isSubmitting, validationErrors } = useFormContext();

  const [saveDraftState, setSaveDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSaveDraft = useCallback(async () => {
    setSaveDraftState('saving');
    try {
      await saveDraft();
      setSaveDraftState('saved');
      setTimeout(() => setSaveDraftState('idle'), 2500);
    } catch {
      setSaveDraftState('error');
      setTimeout(() => setSaveDraftState('idle'), 2500);
    }
  }, [saveDraft]);

  const errorCount = Object.values(validationErrors).reduce((n, errs) => n + errs.length, 0);
  const isSaving = saveDraftState === 'saving';
  const isSaved = saveDraftState === 'saved';

  const handlePrimary = () => {
    if (isOnFinalTab && showSummaryStep) {
      onReview();
    } else if (isOnFinalTab) {
      void submitForm();
    } else {
      onNext();
    }
  };

  const primaryLabel = isOnFinalTab && showSummaryStep
    ? 'Review & Submit'
    : isOnFinalTab
    ? (isSubmitting ? 'Submitting…' : 'Submit')
    : 'Next';

  const primaryIcon = isOnFinalTab
    ? (isSubmitting ? <Spinner size="tiny" /> : <SendRegular />)
    : <ArrowRightRegular />;

  return (
    <div
      className={mergeClasses(styles.bar, sticky && styles.sticky)}
      role="toolbar"
      aria-label="Step navigation"
    >
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        disabled={activeTabIndex === 0 || isSubmitting}
        onClick={onBack}
      >
        Back
      </Button>

      <div className={styles.right}>
        <Button
          appearance="outline"
          icon={isSaving ? <Spinner size="tiny" /> : isSaved ? <CheckmarkCircleRegular /> : <SaveRegular />}
          disabled={!isDirty || isSubmitting || isSaving}
          onClick={() => { void handleSaveDraft(); }}
        >
          {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save Draft'}
        </Button>

        {/*
          DFE-SUBMITCONFIRM-002: moving forward needs this tab's acknowledgement; submitting
          needs every gated tab's, including ones a jump-to-tab button skipped.
        */}
        <Button
          appearance="primary"
          icon={primaryIcon}
          disabled={
            isSubmitting
            || (isOnFinalTab && !showSummaryStep && errorCount > 0)
            || (!isOnFinalTab && !canLeaveCurrentTab)
            || (isOnFinalTab && isSubmitBlockedByTabGate)
          }
          title={
            !isOnFinalTab && !canLeaveCurrentTab
              ? currentTab?.submitConfirmation?.checkboxLabel
              : undefined
          }
          onClick={handlePrimary}
          aria-busy={isOnFinalTab && isSubmitting}
          iconPosition={isOnFinalTab ? 'before' : 'after'}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

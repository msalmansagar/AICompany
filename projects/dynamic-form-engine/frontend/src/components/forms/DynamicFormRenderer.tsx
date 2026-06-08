import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  MessageBar,
  MessageBarBody,
  SkeletonItem,
  Skeleton,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { FormProvider, useFormContext } from '../../contexts/FormContext';
import { DesignContext, DEFAULT_DESIGN_PAYLOAD } from '../../contexts/DesignContext';
import { ResponsiveEngine } from '../../contexts/ResponsiveContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { FormNavigation } from './FormNavigation';
import { TabRenderer } from './TabRenderer';
import { FormActionBar } from './FormActionBar';
import { FormConfirmation } from './FormConfirmation';
import { ThemeSwitcher, readStoredThemePreference } from './ThemeSwitcher';
import { InfoCardFlow } from './info-card/InfoCardFlow';
import { LIGHT_THEME, DARK_THEME } from '../../theme/themes';
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
});

// ── Phase state machine ────────────────────────────────────────────────────

type FormPhase = 'info-cards' | 'form';

interface PhaseState {
  phase: FormPhase;
  screenIndex: number;
}

type PhaseAction =
  | { type: 'NEXT'; totalScreens: number }
  | { type: 'BACK' }
  | { type: 'SKIP' }
  | { type: 'DRAFT_RESUME' }
  | { type: 'SHOW_INFO_CARDS' };

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
  return (
    <FormProvider formCode={formCode} recordId={recordId}>
      <FormRendererInner />
    </FormProvider>
  );
}

function resolveFormMargin(alignment: string | undefined): string {
  if (alignment === 'Left') return '0 auto 0 0';
  if (alignment === 'Right') return '0 0 0 auto';
  return '0 auto'; // Center (default)
}

function FormRendererInner() {
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

  // Theme toggle state — persisted via localStorage.
  const [isDarkMode, setIsDarkMode] = useState<boolean>(readStoredThemePreference);

  const activeTheme = isDarkMode ? DARK_THEME : LIGHT_THEME;

  const design = useMemo<DesignPayload>(() => {
    return formDefinition?.design ?? DEFAULT_DESIGN_PAYLOAD;
  }, [formDefinition]);

  const resolvedTheme = useMemo(() => {
    const baseTheme = design.theme;
    return isDarkMode && !baseTheme.isDarkMode ? activeTheme : baseTheme;
  }, [design.theme, isDarkMode, activeTheme]);

  const handleThemeToggle = useCallback((isDark: boolean) => {
    setIsDarkMode(isDark);
  }, []);

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
    el.textContent = css;

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
  const isStickyBar = design.formDesign.stickyActionBar;
  const hasDarkOption = true;

  const isOnFinalTab =
    activeTab !== undefined && finalTabId !== null && activeTab.id === finalTabId;

  return (
    <ResponsiveEngine>
      <ThemeProvider theme={resolvedTheme}>
        <DesignContext.Provider value={design}>
          {phaseState.phase === 'info-cards' ? (
            // Info-card phase: render InfoCardFlow, do NOT mount DynamicFormRenderer content.
            // RHF context, validation engine, and draft writes are not active in this phase.
            <InfoCardFlow
              formDefinition={formDefinition}
              onComplete={() => dispatchPhase({ type: 'SKIP' })}
            />
          ) : (
            <main
              className={styles.root}
              aria-label={formDefinition.title}
              style={{
                maxWidth: design.formDesign.maxWidth ?? '960px',
                margin: resolveFormMargin(design.formDesign.alignment),
                fontFamily: resolvedTheme.fontFamily,
                fontSize: resolvedTheme.baseFontSize,
              }}
            >
              <header className={styles.header}>
                <div className={styles.headerText}>
                  <h1 className={styles.title}>{formDefinition.title}</h1>
                  {formDefinition.description && (
                    <p className={styles.description}>
                      {formDefinition.description}
                    </p>
                  )}
                </div>

                {hasDarkOption && (
                  <ThemeSwitcher
                    isDarkMode={isDarkMode}
                    onToggle={handleThemeToggle}
                  />
                )}
              </header>

              <FormNavigation
                tabs={visibleTabs}
                activeTabIndex={activeTabIndex}
                onTabChange={setActiveTabIndex}
              />

              <div className={styles.tabContent}>
                {activeTab && (
                  <TabRenderer
                    key={activeTab.id}
                    tab={activeTab}
                    isVisible={true}
                    isTabActive={true}
                  />
                )}
              </div>

              <FormActionBar sticky={isStickyBar} showSubmit={isOnFinalTab} />
            </main>
          )}
        </DesignContext.Provider>
      </ThemeProvider>
    </ResponsiveEngine>
  );
}

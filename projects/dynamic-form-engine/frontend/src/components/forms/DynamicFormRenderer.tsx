import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { LIGHT_THEME, DARK_THEME } from '../../theme/themes';
import type { DesignPayload } from '@dfe/shared';

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
  } = useFormContext();

  // Theme toggle state — persisted via localStorage
  const [isDarkMode, setIsDarkMode] = useState<boolean>(readStoredThemePreference);

  const activeTheme = isDarkMode ? DARK_THEME : LIGHT_THEME;

  // Extract design payload from form definition when available.
  // FormContext currently does not expose design, so we derive from formDefinition
  // once the backend wires the design field. For now we fall back to the default.
  const design = useMemo<DesignPayload>(() => {
    const raw = formDefinition as unknown as { design?: DesignPayload };
    return raw?.design ?? DEFAULT_DESIGN_PAYLOAD;
  }, [formDefinition]);

  // Override theme from design payload but respect the user's dark-mode preference.
  const resolvedTheme = useMemo(() => {
    const baseTheme = design.theme;
    return isDarkMode && !baseTheme.isDarkMode ? activeTheme : baseTheme;
  }, [design.theme, isDarkMode, activeTheme]);

  const hasDarkOption = true; // Always show the switcher per design spec

  const handleThemeToggle = useCallback((isDark: boolean) => {
    setIsDarkMode(isDark);
  }, []);

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

  return (
    <ResponsiveEngine>
      <ThemeProvider theme={resolvedTheme}>
        <DesignContext.Provider value={design}>
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
                <TabRenderer key={activeTab.id} tab={activeTab} isVisible={true} />
              )}
            </div>

            <FormActionBar sticky={isStickyBar} />
          </main>
        </DesignContext.Provider>
      </ThemeProvider>
    </ResponsiveEngine>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import { AppProviders } from './AppProviders';
import { AppearanceProvider } from '@/theme/AppearanceProvider';
import { AppShell } from '@/components/shell/AppShell';
import '@/styles/tokens.css';
import '@/styles/components.css';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerScreen as DesignerScreenName } from '@/state/designerStore';
import { FormListScreen } from '@/screens/FormListScreen';
import { NewFormWizardScreen } from '@/screens/NewFormWizardScreen';
import { DesignerScreen } from '@/screens/DesignerScreen';
import { ThemeEditorScreen } from '@/screens/ThemeEditorScreen';
import { PreviewScreen } from '@/screens/PreviewScreen';
import { PublishValidationScreen } from '@/screens/PublishValidationScreen';
import { VersionHistoryScreen } from '@/screens/VersionHistoryScreen';
import { OptionSetEditorScreen } from '@/screens/OptionSetEditorScreen';
import { LookupConfigScreen } from '@/screens/LookupConfigScreen';
import { RuleConfigScreen } from '@/screens/RuleConfigScreen';
import { SubmissionMappingScreen } from '@/screens/SubmissionMappingScreen';
// Sprint 3+4
import { RuleTemplateEditorScreen } from '@/screens/RuleTemplateEditorScreen';
import { FieldLabelEditorScreen } from '@/screens/FieldLabelEditorScreen';
import { AccessPolicyEditorScreen } from '@/screens/AccessPolicyEditorScreen';
import { createCrmContextService } from '@/services/CrmContextService';
import type { CrmContextService } from '@/services/CrmContextService';

export const CrmContext = React.createContext<CrmContextService | null>(null);

export function App(): React.ReactElement {
  const currentScreen = useDesignerStore(state => state.currentScreen);
  const navigateTo = useDesignerStore(state => state.navigateTo);
  const [crmService, setCrmService] = useState<CrmContextService | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const service = createCrmContextService();
      setCrmService(service);
    } catch (error) {
      setInitError(
        error instanceof Error ? error.message : 'Failed to initialize CRM context'
      );
    }
  }, []);

  if (initError) {
    return (
      <AppearanceProvider>
        <div className="notice error" style={{ margin: 24 }}>
          <strong>Form Designer initialization error:</strong>
          <br />
          {initError}
        </div>
      </AppearanceProvider>
    );
  }

  if (!crmService) {
    return (
      <AppearanceProvider>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Spinner label="Initializing Form Designer..." />
        </div>
      </AppearanceProvider>
    );
  }

  return (
    <AppearanceProvider>
      <CrmContext.Provider value={crmService}>
        <AppProviders>
          <ShelledApp currentScreen={currentScreen} onNavigate={navigateTo} crmService={crmService} />
        </AppProviders>
      </CrmContext.Provider>
    </AppearanceProvider>
  );
}

interface ShelledAppProps {
  currentScreen: DesignerScreenName;
  onNavigate: (screen: DesignerScreenName) => void;
  crmService: CrmContextService;
}

function ShelledApp({ currentScreen, onNavigate, crmService }: ShelledAppProps): React.ReactElement {
  // Outside CRM there is no signed-in user to name, and getUserContext throws
  // rather than inventing one. The avatar simply does not appear.
  const userFullName = useMemo(() => {
    try {
      return crmService.getUserContext().userFullName;
    } catch {
      return undefined;
    }
  }, [crmService]);

  return (
    <AppShell currentScreen={currentScreen} onNavigate={onNavigate} userFullName={userFullName}>
      <ActiveScreen currentScreen={currentScreen} />
    </AppShell>
  );
}

interface ActiveScreenProps {
  currentScreen: DesignerScreenName;
}

function ActiveScreen({ currentScreen }: ActiveScreenProps): React.ReactElement {
  switch (currentScreen) {
    case 'form-list':
      return <FormListScreen />;
    case 'new-form-wizard':
      return <NewFormWizardScreen />;
    case 'designer':
      return <DesignerScreen />;
    case 'theme-editor':
      return <ThemeEditorScreen />;
    case 'preview':
      return <PreviewScreen />;
    case 'publish-validation':
      return <PublishValidationScreen />;
    case 'version-history':
      return <VersionHistoryScreen />;
    case 'option-set-editor':
      return <OptionSetEditorScreen />;
    case 'lookup-config':
      return <LookupConfigScreen />;
    case 'rule-config':
      return <RuleConfigScreen />;
    case 'submission-mapping':
      return <SubmissionMappingScreen />;
    // Sprint 3+4
    case 'rule-template-editor':
      return <RuleTemplateEditorScreen />;
    case 'field-label-editor':
      return <FieldLabelEditorScreen />;
    case 'access-policy-editor':
      return <AccessPolicyEditorScreen />;
    default:
      return <FormListScreen />;
  }
}

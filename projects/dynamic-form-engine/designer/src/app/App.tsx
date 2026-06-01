import React, { useEffect, useState } from 'react';
import { FluentProvider, webLightTheme, Spinner } from '@fluentui/react-components';
import { AppProviders } from './AppProviders';
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
      <FluentProvider theme={webLightTheme}>
        <div style={{ padding: 24, color: '#a4262c' }}>
          <strong>Form Designer initialization error:</strong>
          <br />
          {initError}
        </div>
      </FluentProvider>
    );
  }

  if (!crmService) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Spinner label="Initializing Form Designer..." />
        </div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={crmService}>
        <AppProviders>
          <ActiveScreen currentScreen={currentScreen} />
        </AppProviders>
      </CrmContext.Provider>
    </FluentProvider>
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

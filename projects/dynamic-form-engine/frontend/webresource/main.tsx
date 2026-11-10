// In-CRM form-engine entry point. Reads the form definition GUID from the web resource's
// `data` query parameter, resolves its form code, and renders the reused DynamicFormRenderer.
// A `data` value naming a survey invitation opens that invitation's survey instead.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Spinner } from '@fluentui/react-components';
import { DynamicFormRenderer } from '../src/components/forms/DynamicFormRenderer';
import { LanguageProvider } from '../src/i18n';
import { webApi, cleanGuid } from './xrm/xrmClient';
import { fetchSurvey, startSurvey } from './xrm/surveyApi';
import { parseSurveyContext } from '../src/engine/surveySubmission';
import { AppearanceProvider } from '../src/theme/AppearanceProvider';
import { exposeApiValidatorRegistration } from '../src/engine/apiValidators';
// Shared with the designer so the two cannot drift; the '@qdb/shared' alias
// resolves to a barrel file rather than a directory, hence the path.
import '../../shared/src/theme/tokens.css';
import '../src/styles/components.css';

function readDataParameter(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('data') ?? params.get('id') ?? params.get('formId');
  return raw ? decodeURIComponent(raw) : null;
}

function readFormDefinitionId(): string | null {
  const raw = readDataParameter();
  return raw ? cleanGuid(raw) : null;
}

const errorText = (prefix: string, e: unknown) => prefix + ((e as Error)?.message ?? String(e));

function FormHost() {
  const [formCode, setFormCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // CSE-ENG-001 B6: data=invitationId=<guid>&customerId=<guid> (or token=<token>) opens a survey invitation.
    const survey = parseSurveyContext(readDataParameter());
    if (survey) {
      startSurvey(survey);
      fetchSurvey(survey, '').then(
        (published) => setFormCode(published.formCode),
        (e: unknown) => setError(errorText('Could not open the survey: ', e)),
      );
      return;
    }
    const id = readFormDefinitionId();
    if (!id) {
      setError('No form definition id supplied. Open this web resource with ?data=<formDefinitionGuid>.');
      return;
    }
    webApi()
      .retrieveRecord('qdb_form_definition', id, '?$select=qdb_form_code')
      .then(
        (record) => setFormCode(String(record.qdb_form_code)),
        (e: unknown) => setError(errorText('Could not load the form definition: ', e)),
      );
  }, []);

  if (error) return <div style={{ padding: 24, color: '#a4262c', fontFamily: 'Segoe UI, sans-serif' }}>{error}</div>;
  if (!formCode) return <div style={{ padding: 24 }}><Spinner label="Loading form…" /></div>;
  return <DynamicFormRenderer formCode={formCode} />;
}

// DFE-APIVAL-CAM-001: a script on the hosting CRM page registers API validation handlers
// through this frame's window.DynamicFormEngine.registerApiValidator.
exposeApiValidatorRegistration();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppearanceProvider>
        <LanguageProvider>
          <FormHost />
        </LanguageProvider>
      </AppearanceProvider>
    </React.StrictMode>,
  );
}

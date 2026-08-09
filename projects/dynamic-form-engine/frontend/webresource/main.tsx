// In-CRM form-engine entry point. Reads the form definition GUID from the web resource's
// `data` query parameter, resolves its form code, and renders the reused DynamicFormRenderer.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Spinner } from '@fluentui/react-components';
import { DynamicFormRenderer } from '../src/components/forms/DynamicFormRenderer';
import { LanguageProvider } from '../src/i18n';
import { webApi, cleanGuid } from './xrm/xrmClient';
import { AppearanceProvider } from '../src/theme/AppearanceProvider';
// Shared with the designer so the two cannot drift; the '@qdb/shared' alias
// resolves to a barrel file rather than a directory, hence the path.
import '../../shared/src/theme/tokens.css';
import '../src/styles/components.css';

function readFormDefinitionId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('data') ?? params.get('id') ?? params.get('formId');
  return raw ? cleanGuid(decodeURIComponent(raw)) : null;
}

function FormHost() {
  const [formCode, setFormCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = readFormDefinitionId();
    if (!id) {
      setError('No form definition id supplied. Open this web resource with ?data=<formDefinitionGuid>.');
      return;
    }
    webApi()
      .retrieveRecord('qdb_form_definition', id, '?$select=qdb_form_code')
      .then(
        (record) => setFormCode(String(record.qdb_form_code)),
        (e: unknown) => setError('Could not load the form definition: ' + ((e as Error)?.message ?? String(e))),
      );
  }, []);

  if (error) return <div style={{ padding: 24, color: '#a4262c', fontFamily: 'Segoe UI, sans-serif' }}>{error}</div>;
  if (!formCode) return <div style={{ padding: 24 }}><Spinner label="Loading form…" /></div>;
  return <DynamicFormRenderer formCode={formCode} />;
}

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

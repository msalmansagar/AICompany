import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from '@azure/msal-react';
import {
  Button,
  makeStyles,
  tokens,
  Text,
} from '@fluentui/react-components';
import { msalInstance, loginRequest } from './auth/msalConfig';
import { DynamicFormRenderer } from './components/forms/DynamicFormRenderer';
import { FormCatalogue } from './components/forms/FormCatalogue';
import { LanguageProvider } from './i18n';

const useStyles = makeStyles({
  loginScreen: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    gap: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  loginCard: {
    padding: tokens.spacingVerticalXL,
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
  },
  appTitle: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightBold,
    marginBottom: tokens.spacingVerticalM,
    display: 'block',
  },
  loginDescription: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalL,
    display: 'block',
  },
  appWrapper: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
  },
});

export function App() {
  const styles = useStyles();

  // Derive form code from URL path: /forms/:formCode
  const pathParts = window.location.pathname.split('/');
  const formCodeIndex = pathParts.findIndex((p) => p === 'forms');
  const formCode = formCodeIndex >= 0 ? (pathParts[formCodeIndex + 1] ?? '') : '';
  const recordId = new URLSearchParams(window.location.search).get('recordId') ?? undefined;

  function handleLogin() {
    void msalInstance.loginPopup(loginRequest);
  }

  // Language + RTL are scoped to the form view only (OQ-001). The catalogue
  // and portal shell are intentionally NOT wrapped, so they stay English/LTR.
  const content = formCode ? (
    <LanguageProvider>
      <DynamicFormRenderer formCode={formCode} recordId={recordId} />
    </LanguageProvider>
  ) : (
    <FormCatalogue />
  );

  if (import.meta.env.VITE_SKIP_AUTH === 'true') {
    return <div className={styles.appWrapper}>{content}</div>;
  }

  return (
    <>
      <UnauthenticatedTemplate>
        <div className={styles.loginScreen}>
          <div className={styles.loginCard}>
            <Text className={styles.appTitle} as="h1">
              Dynamic Form Engine
            </Text>
            <Text className={styles.loginDescription}>
              Sign in with your organizational account to continue.
            </Text>
            <Button
              appearance="primary"
              size="large"
              onClick={handleLogin}
              aria-label="Sign in with Microsoft"
            >
              Sign in
            </Button>
          </div>
        </div>
      </UnauthenticatedTemplate>

      <AuthenticatedTemplate>
        <div className={styles.appWrapper}>{content}</div>
      </AuthenticatedTemplate>
    </>
  );
}

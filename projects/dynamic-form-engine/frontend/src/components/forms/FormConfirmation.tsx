import {
  Card,
  Text,
  makeStyles,
  tokens,
  Button,
} from '@fluentui/react-components';
import { CheckmarkCircle48Filled } from '@fluentui/react-icons';

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '400px',
    padding: tokens.spacingVerticalXL,
  },
  card: {
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
  },
  iconWrapper: {
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorPaletteGreenForeground1,
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalS,
    display: 'block',
  },
  message: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalL,
    display: 'block',
    lineHeight: tokens.lineHeightBase400,
  },
  referenceBox: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    marginBottom: tokens.spacingVerticalL,
  },
  referenceLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginBottom: tokens.spacingVerticalXXS,
  },
  referenceNumber: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'monospace',
    color: tokens.colorNeutralForeground1,
    display: 'block',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

interface FormConfirmationProps {
  confirmationMessage: string;
  referenceNumber: string | null;
}

export function FormConfirmation({
  confirmationMessage,
  referenceNumber,
}: FormConfirmationProps) {
  const styles = useStyles();

  function handleStartNew() {
    window.location.reload();
  }

  return (
    <div className={styles.wrapper} role="main" aria-label="Submission confirmed">
      <Card className={styles.card}>
        <div className={styles.iconWrapper} aria-hidden="true">
          <CheckmarkCircle48Filled />
        </div>

        <Text className={styles.title} as="h2">
          Submission successful
        </Text>

        <Text className={styles.message}>{confirmationMessage}</Text>

        {referenceNumber && (
          <div className={styles.referenceBox} aria-live="polite">
            <Text className={styles.referenceLabel}>Reference number</Text>
            <Text className={styles.referenceNumber} aria-label={`Reference number: ${referenceNumber}`}>
              {referenceNumber}
            </Text>
          </div>
        )}

        <div className={styles.actions}>
          <Button appearance="primary" onClick={handleStartNew}>
            Submit another
          </Button>
        </div>
      </Card>
    </div>
  );
}

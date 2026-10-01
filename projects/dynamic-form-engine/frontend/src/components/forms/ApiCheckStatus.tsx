import { Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useFormContext } from '../../contexts/FormContext';

const useStyles = makeStyles({
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * "Checking…" under a field while the front end's API validation for it is running
 * (DFE-APIVAL-CAM-001). Renders nothing otherwise, and nothing in a context without the state.
 */
export function ApiCheckStatus({ fieldId }: { fieldId: string }) {
  const styles = useStyles();
  const { checkingFieldIds } = useFormContext();
  if (!checkingFieldIds?.has(fieldId)) return null;

  return (
    <div className={styles.status} role="status" aria-live="polite">
      <Spinner size="extra-tiny" />
      <Text size={200}>Checking…</Text>
    </div>
  );
}

import {
  Button,
  Spinner,
  Badge,
  makeStyles,
} from '@fluentui/react-components';
import { SendRegular } from '@fluentui/react-icons';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import type { ButtonStyleType } from '@qdb/shared';

const BUTTON_APPEARANCE_MAP: Record<ButtonStyleType, 'primary' | 'outline' | 'transparent'> = {
  Primary: 'primary',
  Outline: 'outline',
  Text: 'transparent',
};

const useStyles = makeStyles({
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  button: {
    minWidth: '120px',
  },
  errorBadge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
  },
});

export function SubmitButton() {
  const styles = useStyles();
  const { submitForm, isSubmitting, validationErrors, isSubmitted } = useFormContext();
  const design = useDesignContext();
  const buttonAppearance = BUTTON_APPEARANCE_MAP[design.formDesign.buttonStyle ?? 'Primary'];

  const errorCount = Object.values(validationErrors).reduce(
    (sum, errs) => sum + errs.length,
    0,
  );

  const isDisabled = isSubmitting || isSubmitted;

  async function handleSubmit() {
    await submitForm();
  }

  return (
    <div className={styles.wrapper}>
      <Button
        className={styles.button}
        appearance={buttonAppearance}
        icon={isSubmitting ? <Spinner size="tiny" /> : <SendRegular />}
        onClick={handleSubmit}
        disabled={isDisabled}
        aria-label={
          isSubmitting
            ? 'Submitting form...'
            : errorCount > 0
              ? `Submit form â€” ${errorCount} validation error${errorCount > 1 ? 's' : ''}`
              : 'Submit form'
        }
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </Button>

      {errorCount > 0 && !isSubmitting && (
        <Badge
          className={styles.errorBadge}
          appearance="filled"
          color="danger"
          size="small"
          aria-label={`${errorCount} validation error${errorCount > 1 ? 's' : ''}`}
        >
          {errorCount}
        </Badge>
      )}
    </div>
  );
}

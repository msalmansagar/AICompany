import { useState } from 'react';
import {
  Button,
  Spinner,
  Badge,
  Checkbox,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SendRegular } from '@fluentui/react-icons';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import { evaluateTabConfirmation } from './tabConfirmation';
import type { ButtonStyleType } from '@qdb/shared';

const BUTTON_APPEARANCE_MAP: Record<ButtonStyleType, 'primary' | 'outline' | 'transparent'> = {
  Primary: 'primary',
  Outline: 'outline',
  Text: 'transparent',
};

const useStyles = makeStyles({
  // DFE-SUBMITCONFIRM-001: stacks the acknowledgement checkbox above the button.
  gate: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    alignItems: 'flex-end',
  },
  acknowledgement: {
    maxWidth: '420px',
  },
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
  pendingTabs: {
    marginTop: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
  },
});

export function SubmitButton() {
  const styles = useStyles();
  const {
    submitForm,
    isSubmitting,
    validationErrors,
    isSubmitted,
    formDefinition,
    submitAcknowledged,
    setSubmitAcknowledged,
    tabAcknowledgements,
    ruleState,
  } = useFormContext();
  const design = useDesignContext();
  const buttonAppearance = BUTTON_APPEARANCE_MAP[design.formDesign.buttonStyle ?? 'Primary'];
  const [dialogOpen, setDialogOpen] = useState(false);

  const errorCount = Object.values(validationErrors).reduce(
    (sum, errs) => sum + errs.length,
    0,
  );

  // DFE-SUBMITCONFIRM-001: when configured, Submit stays disabled until the user
  // ticks the acknowledgement checkbox (which also opens a confirmation dialog).
  const confirmation = formDefinition?.submitConfirmation;

  // DFE-SUBMITCONFIRM-002: and until every tab that requires one has been acknowledged —
  // re-checked here because a jump-to-tab button can reach Submit past an unseen gate.
  const visibleTabs = (formDefinition?.tabs ?? [])
    .filter((tab) => ruleState.tabVisibility[tab.id] ?? tab.isVisible);
  const { unacknowledgedTabs } = evaluateTabConfirmation(visibleTabs, tabAcknowledgements);

  const isDisabled = isSubmitting
    || isSubmitted
    || (!!confirmation && !submitAcknowledged)
    || unacknowledgedTabs.length > 0;

  async function handleSubmit() {
    await submitForm();
  }

  function handleAcknowledgementChange(checked: boolean) {
    setSubmitAcknowledged(checked);
    if (checked) setDialogOpen(true);
  }

  const submitButton = (
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

      {/* Without this, an unseen tab gate disables Submit and gives no reason why. */}
      {unacknowledgedTabs.length > 0 && !isSubmitting && (
        <div className={styles.pendingTabs} role="status">
          {`Confirm before submitting: ${unacknowledgedTabs.map((tab) => tab.label).join(', ')}`}
        </div>
      )}
    </div>
  );

  // No confirmation configured → behave exactly as before (legacy).
  if (!confirmation) return submitButton;

  return (
    <div className={styles.gate}>
      <Checkbox
        className={styles.acknowledgement}
        checked={submitAcknowledged}
        onChange={(_, data) => handleAcknowledgementChange(data.checked === true)}
        label={confirmation.checkboxLabel}
        disabled={isSubmitting || isSubmitted}
      />

      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Please confirm</DialogTitle>
            <DialogContent>
              {confirmation.dialogMessage ?? 'Please confirm you want to submit this form.'}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary">OK</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {submitButton}
    </div>
  );
}

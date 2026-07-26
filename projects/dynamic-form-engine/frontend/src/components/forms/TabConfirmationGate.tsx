// DFE-SUBMITCONFIRM-002: the acknowledgement checkbox a tab can require.
//
// Rendered at the end of the tab's content, below its sections, so the user reads the tab
// before confirming it. Mirrors the form-level gate in SubmitButton: ticking it opens the
// dialog when the maker configured a message.
import { useState } from 'react';
import {
  Checkbox,
  Button,
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
import type { SubmitConfirmationConfig } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';

const useStyles = makeStyles({
  gate: {
    marginTop: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

interface TabConfirmationGateProps {
  tabId: string;
  confirmation: SubmitConfirmationConfig;
}

export function TabConfirmationGate({ tabId, confirmation }: TabConfirmationGateProps) {
  const styles = useStyles();
  const { tabAcknowledgements, setTabAcknowledged, isSubmitting, isSubmitted } = useFormContext();
  const [dialogOpen, setDialogOpen] = useState(false);

  const acknowledged = tabAcknowledgements[tabId] === true;

  function handleChange(checked: boolean) {
    setTabAcknowledged(tabId, checked);
    if (checked && confirmation.dialogMessage) setDialogOpen(true);
  }

  return (
    <div className={styles.gate} data-testid={`tab-confirmation-${tabId}`}>
      <Checkbox
        className={styles.label}
        checked={acknowledged}
        onChange={(_, data) => handleChange(data.checked === true)}
        label={confirmation.checkboxLabel}
        disabled={isSubmitting || isSubmitted}
      />

      {confirmation.dialogMessage && (
        <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Please confirm</DialogTitle>
              <DialogContent>{confirmation.dialogMessage}</DialogContent>
              <DialogActions>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="primary">OK</Button>
                </DialogTrigger>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}

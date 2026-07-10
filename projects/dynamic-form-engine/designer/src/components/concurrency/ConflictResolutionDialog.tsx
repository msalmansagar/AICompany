import React from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { WarningRegular } from '@fluentui/react-icons';
import { FormDiffViewer } from './FormDiffViewer';

export interface ConflictResolutionDialogProps {
  isOpen: boolean;
  formId: string;
  localEtag: string;
  conflictTimestamp: Date;
  onReload: () => void;
  onDismiss: () => void;
}

const useStyles = makeStyles({
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  warningIcon: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '20px',
  },
  timestamp: {
    color: tokens.colorNeutralForeground3,
    marginTop: '8px',
    display: 'block',
  },
  diffArea: {
    marginTop: '16px',
  },
});

export function ConflictResolutionDialog({
  isOpen,
  formId,
  localEtag,
  conflictTimestamp,
  onReload,
  onDismiss,
}: ConflictResolutionDialogProps): React.ReactElement {
  const styles = useStyles();
  const [showDiff, setShowDiff] = React.useState(false);

  const handleReload = (): void => {
    setShowDiff(false);
    onReload();
  };

  const handleReview = (): void => {
    setShowDiff(true);
  };

  const handleDismiss = (): void => {
    setShowDiff(false);
    onDismiss();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_ev, data) => { if (!data.open) handleDismiss(); }}>
      <DialogSurface>
        <DialogTitle>
          <div className={styles.titleRow}>
            <WarningRegular className={styles.warningIcon} aria-hidden="true" />
            This form was changed by someone else
          </div>
        </DialogTitle>
        <DialogBody>
          <DialogContent>
            <Text>
              Your changes could not be saved because another user modified this form after
              you opened it. Choose how to proceed:
            </Text>
            <Text as="span" size={100} className={styles.timestamp}>
              Conflict detected at {conflictTimestamp.toLocaleTimeString()}
            </Text>
            {showDiff && (
              <div className={styles.diffArea}>
                <FormDiffViewer formId={formId} localEtag={localEtag} />
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {!showDiff && (
              <Button
                appearance="subtle"
                onClick={handleReview}
                aria-label="Review what changed before deciding"
              >
                Review what changed
              </Button>
            )}
            <Button
              appearance="primary"
              onClick={handleReload}
              aria-label="Reload the form discarding your local changes"
            >
              Reload
            </Button>
            <Button appearance="secondary" onClick={handleDismiss}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

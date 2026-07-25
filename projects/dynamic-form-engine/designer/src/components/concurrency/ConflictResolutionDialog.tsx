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
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { WarningRegular } from '@fluentui/react-icons';
import type { DesignerFormModel } from '@/state/models/DesignerFormModel';
import { FormDiffViewer } from '../FormDiffViewer';
import { diffForms, summarizeDiff } from '@/services/FormDiffService';

export interface ConflictResolutionDialogProps {
  isOpen: boolean;
  /** Local form snapshot captured at the moment the 412 was received. */
  localSnapshot: DesignerFormModel;
  conflictTimestamp: Date;
  /** Resolves the current server version for the diff view. */
  fetchServerVersion: () => Promise<DesignerFormModel>;
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
  diffSummary: {
    marginTop: '8px',
    display: 'block',
  },
});

type DiffState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; serverVersion: DesignerFormModel }
  | { kind: 'error' };

export function ConflictResolutionDialog({
  isOpen,
  localSnapshot,
  conflictTimestamp,
  fetchServerVersion,
  onReload,
  onDismiss,
}: ConflictResolutionDialogProps): React.ReactElement {
  const styles = useStyles();
  const [diffState, setDiffState] = React.useState<DiffState>({ kind: 'idle' });

  const handleReload = (): void => {
    setDiffState({ kind: 'idle' });
    onReload();
  };

  const handleReview = (): void => {
    setDiffState({ kind: 'loading' });
    fetchServerVersion()
      .then((serverVersion) => setDiffState({ kind: 'loaded', serverVersion }))
      .catch((error: unknown) => {
        console.error('[ConflictResolutionDialog] Failed to fetch server version', { error });
        setDiffState({ kind: 'error' });
      });
  };

  const handleDismiss = (): void => {
    setDiffState({ kind: 'idle' });
    onDismiss();
  };

  // Use H's real diffForms + summarizeDiff from FormDiffService (replaces A's stub).
  const diffSummary =
    diffState.kind === 'loaded'
      ? summarizeDiff(diffForms(localSnapshot, diffState.serverVersion))
      : null;

  return (
    <Dialog open={isOpen} onOpenChange={(_ev, data) => { if (!data.open) handleDismiss(); }}>
      <DialogSurface role="alertdialog" aria-describedby="conflict-dialog-description">
        <DialogTitle>
          <div className={styles.titleRow}>
            <WarningRegular className={styles.warningIcon} aria-hidden="true" />
            This form was changed by someone else
          </div>
        </DialogTitle>
        <DialogBody>
          <DialogContent>
            <Text id="conflict-dialog-description">
              Your changes could not be saved because another user modified this form after
              you opened it. Choose how to proceed:
            </Text>
            <Text as="span" size={100} className={styles.timestamp}>
              Conflict detected at {conflictTimestamp.toLocaleTimeString()}
            </Text>

            {diffSummary && (
              <Text as="span" size={200} className={styles.diffSummary}>
                {diffSummary.humanReadable}
              </Text>
            )}

            {diffState.kind === 'loading' && (
              <div className={styles.diffArea}>
                <Spinner label="Loading server version…" size="tiny" />
              </div>
            )}

            {diffState.kind === 'loaded' && (
              <div className={styles.diffArea}>
                <FormDiffViewer before={localSnapshot} after={diffState.serverVersion} />
              </div>
            )}

            {diffState.kind === 'error' && (
              <Text as="span" size={200} className={styles.diffSummary} style={{ color: tokens.colorPaletteRedForeground1 }}>
                Could not load the server version. Use &quot;Reload&quot; to refresh the form.
              </Text>
            )}
          </DialogContent>
          <DialogActions>
            {diffState.kind === 'idle' && (
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

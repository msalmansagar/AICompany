import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { VersionService, type FormVersion } from '@/services/VersionService';
import { AuditLogService } from '@/services/AuditLogService';
import { useDesignerStore } from '@/state/designerStore';
import { DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '100px 140px 1fr 1fr 200px',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '100px 140px 1fr 1fr 200px',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '6px',
    alignItems: 'center',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  columnLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    color: tokens.colorNeutralForeground3,
    gap: '8px',
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '14px',
  },
  snapshotContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  snapshotRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '13px',
  },
});

interface RestoreConfirmDialogProps {
  version: FormVersion;
  isOpen: boolean;
  isRestoring: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RestoreConfirmDialog({ version, isOpen, isRestoring, onConfirm, onCancel }: RestoreConfirmDialogProps): React.ReactElement {
  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Restore Version {version.versionNumber}</DialogTitle>
          <DialogContent>
            <Text>
              This will restore the form to version <strong>{version.versionNumber}</strong> (
              {version.versionLabel}). The current designer state will be replaced. This action cannot be undone.
            </Text>
            <br /><br />
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              Published on: {version.publishedOn?.toLocaleString() ?? 'Unknown'}
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={onCancel} disabled={isRestoring}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={onConfirm}
              disabled={isRestoring}
              icon={isRestoring ? <Spinner size="tiny" /> : undefined}
            >
              {isRestoring ? 'Restoring...' : 'Restore as Draft'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

interface VersionSnapshotDialogProps {
  version: FormVersion | null;
  onClose: () => void;
}

function VersionSnapshotDialog({ version, onClose }: VersionSnapshotDialogProps): React.ReactElement {
  const styles = useStyles();

  if (!version) return <></>;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Version Number', value: version.versionNumber },
    { label: 'Label', value: version.versionLabel },
    { label: 'Published On', value: version.publishedOn?.toLocaleString() ?? 'Not published' },
    { label: 'Published By', value: version.publishedBy ?? 'Unknown' },
  ];

  return (
    <Dialog open onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Version {version.versionNumber} Details</DialogTitle>
          <DialogContent>
            <div className={styles.snapshotContent}>
              {rows.map(row => (
                <div key={row.label} className={styles.snapshotRow}>
                  <span style={{ color: tokens.colorNeutralForeground3 }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function VersionHistoryScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const form = useDesignerStore(s => s.form);
  const resetDesigner = useDesignerStore(s => s.resetDesigner);
  const loadForm = useDesignerStore(s => s.loadForm);

  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<FormVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [viewTarget, setViewTarget] = useState<FormVersion | null>(null);

  useEffect(() => {
    if (!crmService || !form) return;
    setIsLoading(true);
    setLoadError(null);

    const versionService = new VersionService(crmService.getWebApi());
    versionService.listVersions(form.id)
      .then(result => setVersions(result))
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load version history'))
      .finally(() => setIsLoading(false));
  }, [crmService, form]);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const handleRestore = useCallback(async () => {
    if (!crmService || !restoreTarget || !form) return;
    setIsRestoring(true);

    try {
      const webApi = crmService.getWebApi();
      const userContext = crmService.getUserContext();
      const versionService = new VersionService(webApi);
      const auditService = new AuditLogService(webApi, userContext);

      const snapshot = await versionService.getVersionSnapshot(restoreTarget.id);

      resetDesigner();

      // Restore from snapshot — extract the parts loadForm expects
      const restoredForm = snapshot.form ?? form;
      const tabs = Object.values(snapshot.tabs ?? {});
      const sections = Object.values(snapshot.sections ?? {});
      const fields = Object.values(snapshot.fields ?? {});
      const validationRules = Object.values(snapshot.validationRules ?? {});
      const businessRules = Object.values(snapshot.businessRules ?? {});
      const restoredDesignPayload = snapshot.designPayload ?? DEFAULT_DESIGN_PAYLOAD;

      loadForm({
        form: { ...restoredForm, status: 'draft' },
        tabs,
        sections,
        fields,
        validationRules,
        businessRules,
        designPayload: restoredDesignPayload,
      });

      await auditService.logAction(form.id, 'RESTORE_VERSION', {
        versionNumber: restoreTarget.versionNumber,
      });

      navigateTo('designer');
    } catch (err) {
      setIsRestoring(false);
      setRestoreTarget(null);
      setLoadError(err instanceof Error ? err.message : 'Restore failed. Please try again.');
    }
  }, [crmService, restoreTarget, form, resetDesigner, loadForm, navigateTo]);

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack} disabled={isRestoring}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Version History</Text>
        {form && (
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            — {form.name}
          </Text>
        )}
      </div>

      <div className={styles.body}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Spinner label="Loading version history..." />
          </div>
        ) : loadError ? (
          <div>
            <Text className={styles.errorText}>{loadError}</Text>
          </div>
        ) : versions.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size={400} weight="semibold">No published versions yet</Text>
            <Text size={300}>Publish this form to create the first version snapshot.</Text>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader} role="row">
              <span className={styles.columnLabel}>Version</span>
              <span className={styles.columnLabel}>Status</span>
              <span className={styles.columnLabel}>Published On</span>
              <span className={styles.columnLabel}>Published By</span>
              <span className={styles.columnLabel}>Actions</span>
            </div>

            {versions.map(version => (
              <div key={version.id} className={styles.tableRow} role="row">
                <Text font="monospace" weight="semibold">v{version.versionNumber}</Text>
                <Badge appearance="filled" color="success">Published</Badge>
                <Text size={300}>{version.publishedOn?.toLocaleString() ?? '—'}</Text>
                <Text size={300}>{version.publishedBy ?? '—'}</Text>
                <div className={styles.actions}>
                  <Button
                    size="small"
                    appearance="outline"
                    onClick={() => setViewTarget(version)}
                    aria-label={`View version ${version.versionNumber} details`}
                  >
                    View
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() => setRestoreTarget(version)}
                    aria-label={`Restore version ${version.versionNumber} as draft`}
                  >
                    Restore as Draft
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {restoreTarget && (
        <RestoreConfirmDialog
          version={restoreTarget}
          isOpen={!!restoreTarget}
          isRestoring={isRestoring}
          onConfirm={() => void handleRestore()}
          onCancel={() => setRestoreTarget(null)}
        />
      )}

      <VersionSnapshotDialog
        version={viewTarget}
        onClose={() => setViewTarget(null)}
      />
    </div>
  );
}

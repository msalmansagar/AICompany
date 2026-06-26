import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { VersionService } from '@/services/VersionService';
import { AuditLogService } from '@/services/AuditLogService';
import { PublishService } from '@/services/PublishService';
import { PUBLISH_JOB_STATUS } from '@/constants/attributeNames';
import { useDesignerStore } from '@/state/designerStore';
import { validateForPublish, type ValidationIssue } from '@/validation/publishValidation';

type RenderCacheStatus = 'idle' | 'generating' | 'complete' | 'failed';

const PUBLISH_GATE_DESCRIPTIONS: Record<string, string> = {
  'PV-001': 'Form name is present and valid',
  'PV-002': 'Form code follows naming conventions',
  'PV-003': 'Form has at least one tab',
  'PV-004': 'All tabs have labels',
  'PV-005': 'All tabs have at least one section',
  'PV-006': 'All fields have labels',
  'PV-007': 'All fields have codes',
  'PV-008': 'All field codes are unique within the form',
  'PV-009': 'Option-based fields have at least one option defined',
  'PV-010': 'Lookup fields have target entity configured',
  'PV-011': 'Form has a target CRM entity configured',
  'PV-012': 'Form has at least one required field',
};

const ALL_GATE_CODES = Object.keys(PUBLISH_GATE_DESCRIPTIONS);

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
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
    gap: '16px',
    maxWidth: '680px',
    margin: '0 auto',
    width: '100%',
  },
  gateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  gateCode: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: tokens.colorNeutralForeground3,
    width: '56px',
    flexShrink: 0,
  },
  gateDescription: {
    flex: 1,
    fontSize: '14px',
  },
  gateIssueMessage: {
    fontSize: '12px',
    color: tokens.colorPaletteRedForeground1,
    marginTop: '2px',
  },
  gateIcon: {
    flexShrink: 0,
    width: '20px',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  footerActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryBadge: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  renderCacheStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
});

interface GateRowProps {
  code: string;
  issue: ValidationIssue | null;
}

function GateRow({ code, issue }: GateRowProps): React.ReactElement {
  const styles = useStyles();

  const description = PUBLISH_GATE_DESCRIPTIONS[code] ?? code;
  const isPassing = issue === null;
  const isWarning = issue?.severity === 'warning';

  function renderIcon(): React.ReactElement {
    if (isPassing) {
      return <CheckmarkCircleRegular fontSize={20} style={{ color: tokens.colorPaletteGreenForeground1 }} />;
    }
    if (isWarning) {
      return <WarningRegular fontSize={20} style={{ color: tokens.colorPaletteYellowForeground1 }} />;
    }
    return <DismissCircleRegular fontSize={20} style={{ color: tokens.colorPaletteRedForeground1 }} />;
  }

  return (
    <div className={styles.gateRow} role="listitem">
      <div className={styles.gateIcon}>{renderIcon()}</div>
      <span className={styles.gateCode}>{code}</span>
      <div style={{ flex: 1 }}>
        <div className={styles.gateDescription}>{description}</div>
        {issue && <div className={styles.gateIssueMessage}>{issue.message}</div>}
      </div>
      <Badge
        appearance="filled"
        color={isPassing ? 'success' : isWarning ? 'warning' : 'danger'}
      >
        {isPassing ? 'PASS' : 'FAIL'}
      </Badge>
    </div>
  );
}

export function PublishValidationScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const form = useDesignerStore(s => s.form);
  const markPublishing = useDesignerStore(s => s.markPublishing);
  const markPublished = useDesignerStore(s => s.markPublished);

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [isValidating, setIsValidating] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [renderCacheStatus, setRenderCacheStatus] = useState<RenderCacheStatus>('idle');
  const [renderCacheError, setRenderCacheError] = useState<string | null>(null);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);

  useEffect(() => {
    const state = useDesignerStore.getState();
    const result = validateForPublish(state);
    setIssues(result.issues);
    setIsValidating(false);
  }, []);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const handleConfirmPublish = useCallback(async () => {
    if (!crmService || !form) return;
    setIsPublishing(true);
    setPublishError(null);
    markPublishing();

    try {
      const webApi = crmService.getWebApi();
      const userContext = crmService.getUserContext();
      const formService = new FormDefinitionService(webApi);
      const versionService = new VersionService(webApi);
      const auditService = new AuditLogService(webApi, userContext);

      const currentVersion = form.currentVersion;
      const newVersion = versionService.incrementMajorVersion(currentVersion);

      await formService.updateForm(form.id, { status: 'published', currentVersion: newVersion });

      const snapshot = useDesignerStore.getState();
      await versionService.createVersion(
        form.id,
        newVersion,
        `Published v${newVersion}`,
        snapshot,
        userContext.userFullName
      );

      await auditService.logAction(form.id, 'PUBLISH', { versionNumber: newVersion });

      // Phase 5 — trigger render cache generation (non-blocking UI)
      if (!crmService.isRestMode()) {
        const publishService = new PublishService(webApi);
        const jobId = await publishService.publish({
          formDefinitionId: form.id,
          formCode: form.code,
          targetVersion: newVersion,
        });
        setPublishJobId(jobId);
        setRenderCacheStatus('generating');
        // Poll in the background — do not block UI navigation
        void publishService.pollUntilComplete(jobId).then((finalStatus) => {
          if (finalStatus.status === PUBLISH_JOB_STATUS.COMPLETED) {
            setRenderCacheStatus('complete');
          } else {
            setRenderCacheStatus('failed');
            setRenderCacheError(finalStatus.errorDetails ?? 'Render cache generation failed.');
          }
        }).catch((err: unknown) => {
          setRenderCacheStatus('failed');
          setRenderCacheError(err instanceof Error ? err.message : 'Render cache generation failed.');
        });
      }

      markPublished();
      navigateTo('designer');
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed. Please try again.');
    } finally {
      setIsPublishing(false);
      // Always reset the store's isPublishing flag — markPublished() only runs on success
      useDesignerStore.setState({ isPublishing: false });
    }
  }, [crmService, form, markPublishing, markPublished, navigateTo]);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const canPublish = !isValidating && errorCount === 0;

  const issueByCode = new Map(issues.map(i => [i.code, i]));

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack} disabled={isPublishing}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Publish Validation</Text>
      </div>

      <div className={styles.body}>
        <div>
          <Text size={500} weight="semibold" block style={{ marginBottom: '4px' }}>Pre-Publish Checklist</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            All error gates must pass before the form can be published. Warnings are allowed.
          </Text>
        </div>

        {isValidating ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Spinner label="Running validation checks..." />
          </div>
        ) : (
          <div role="list" aria-label="Validation gates">
            {ALL_GATE_CODES.map(code => (
              <GateRow key={code} code={code} issue={issueByCode.get(code) ?? null} />
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.summaryBadge}>
            {errorCount > 0 && (
              <Badge appearance="filled" color="danger">
                {errorCount} Error{errorCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge appearance="filled" color="warning">
                {warningCount} Warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {errorCount === 0 && !isValidating && (
              <Badge appearance="filled" color="success">All Errors Resolved</Badge>
            )}
          </div>

          {errorCount > 0 && (
            <Text size={300} style={{ color: tokens.colorPaletteRedForeground1 }}>
              Fix {errorCount} error{errorCount !== 1 ? 's' : ''} before publishing.
            </Text>
          )}

          {publishError && (
            <Text size={300} style={{ color: tokens.colorPaletteRedForeground1 }} role="alert">
              {publishError}
            </Text>
          )}

          {(publishJobId !== null || renderCacheStatus !== 'idle') && (
            <div className={styles.renderCacheStatusRow} role="status" aria-live="polite">
              {renderCacheStatus === 'generating' && (
                <>
                  <Spinner size="tiny" />
                  <Text size={200}>Generating render cache...</Text>
                </>
              )}
              {renderCacheStatus === 'complete' && (
                <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                  Render cache generated successfully.
                </Text>
              )}
              {renderCacheStatus === 'failed' && (
                <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                  {renderCacheError ?? 'Render cache generation failed.'}
                </Text>
              )}
            </div>
          )}

          <div className={styles.footerActions}>
            <Button appearance="subtle" onClick={handleBack} disabled={isPublishing}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => void handleConfirmPublish()}
              disabled={!canPublish || isPublishing}
              icon={isPublishing ? <Spinner size="tiny" /> : undefined}
            >
              {isPublishing ? 'Publishing...' : 'Confirm Publish'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { serializeDesignerState } from '@/services/designerState';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import { ValidationService } from '@/services/ValidationService';
import type { Violation } from '@/services/ValidationService';
import { VersioningService } from '@/services/VersioningService';
import { AuditService } from '@/services/AuditService';
import { assertGuid } from '@/services/assertGuid';

interface UsePublishResult {
  isPublishing: boolean;
  /** Publishes; pass acknowledgeWarnings to proceed past a warning stop. */
  publish: (options?: { acknowledgeWarnings?: boolean }) => Promise<void>;
  error: string | null;
  /** Non-null when a publish stopped to have its warnings acknowledged. */
  pendingWarnings: Violation[] | null;
  dismissWarnings: () => void;
}

const validationService = new ValidationService();
const versioningService = new VersioningService();

export function usePublish(): UsePublishResult {
  const adapter = useCrmAdapter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { process, steps, outcomes, routes, stepOrder, outcomeOrder, setProcess, setPublishing, setValidationResults } =
    useWorkflowStore((s) => ({
      process: s.process,
      steps: s.steps,
      outcomes: s.outcomes,
      routes: s.routes,
      stepOrder: s.stepOrder,
      outcomeOrder: s.outcomeOrder,
      setProcess: s.setProcess,
      setPublishing: s.setPublishing,
      setValidationResults: s.setValidationResults,
    }));

  // CWFD-016 B7: warnings used to ride through publish in silence. Now they
  // stop it once, are shown, and — if the publisher accepts them — the
  // acceptance is recorded with the publish rather than merely allowed.
  const [pendingWarnings, setPendingWarnings] = useState<Violation[] | null>(null);
  const dismissWarnings = useCallback(() => setPendingWarnings(null), []);

  const publish = useCallback(async (options?: { acknowledgeWarnings?: boolean }) => {
    if (!process) {
      setError('No process loaded.');
      return;
    }

    // Validate before publish and persist results to store for UI display
    const newViolations = validationService.validate({ process, steps, outcomes, routes, stepOrder, outcomeOrder });
    setValidationResults(newViolations);

    const hasBlockingErrors = newViolations.some((v) => v.severity === 'error');
    if (hasBlockingErrors) {
      setError('Validation failed. Fix all errors before publishing.');
      return;
    }

    const warnings = newViolations.filter((v) => v.severity === 'warning');
    if (warnings.length > 0 && !options?.acknowledgeWarnings) {
      setPendingWarnings(warnings);
      return;
    }
    setPendingWarnings(null);

    setIsPublishing(true);
    setPublishing(true);
    setError(null);

    try {
      assertGuid(process.crmId, 'process.crmId');

      // Determine version bump
      const isBreaking = versioningService.isBreakingChange(process.snapshot, { steps, outcomes });
      const newVersion = isBreaking
        ? versioningService.incrementMajor(process)
        : versioningService.incrementMinor(process);

      // Create snapshot
      const snapshot = versioningService.createSnapshot({ process, steps, outcomes, routes, nodePositions: {} });

      // Spec §21: publishing over warnings is allowed "after acknowledgement".
      // The acknowledgement travels with the published state so an auditor can
      // see what was accepted, not merely that nothing blocked.
      const acknowledgedWarnings =
        warnings.length > 0
          ? {
              at: new Date().toISOString(),
              count: warnings.length,
              codes: [...new Set(warnings.map((w) => w.code))],
            }
          : null;

      // Update process in CRM
      // updateProcess only maps qdb_name, so these fields never reached CRM;
      // the designer state annotation is what actually persists a publish.
      await adapter.saveDesignerState(
        process.crmId,
        serializeDesignerState({
          workflowState: 'published',
          versionMajor: newVersion.versionMajor,
          versionMinor: newVersion.versionMinor,
          snapshot,
          acknowledgedWarnings,
        })
      );
      await adapter.updateProcess(process.crmId, {
        versionMajor: newVersion.versionMajor,
        versionMinor: newVersion.versionMinor,
        workflowState: 'published',
        snapshot,
      });

      // Update local state
      setProcess({
        ...process,
        versionMajor: newVersion.versionMajor,
        versionMinor: newVersion.versionMinor,
        workflowState: 'published',
        snapshot,
      });

      // Audit
      const auditService = new AuditService(adapter);
      await auditService.log('PUBLISH', process.crmId, {
        version: `${newVersion.versionMajor}.${newVersion.versionMinor}`,
        isBreaking,
        acknowledgedWarningCount: acknowledgedWarnings?.count ?? 0,
        acknowledgedWarningCodes: acknowledgedWarnings?.codes ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setIsPublishing(false);
      setPublishing(false);
    }
  }, [adapter, process, steps, outcomes, routes, stepOrder, outcomeOrder, setProcess, setPublishing, setValidationResults]);

  return { isPublishing, publish, error, pendingWarnings, dismissWarnings };
}

import { useState, useCallback } from 'react';
import { serializeDesignerState } from '@/services/designerState';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import { ValidationService } from '@/services/ValidationService';
import { VersioningService } from '@/services/VersioningService';
import { AuditService } from '@/services/AuditService';
import { assertGuid } from '@/services/assertGuid';

interface UsePublishResult {
  isPublishing: boolean;
  publish: () => Promise<void>;
  error: string | null;
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

  const publish = useCallback(async () => {
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setIsPublishing(false);
      setPublishing(false);
    }
  }, [adapter, process, steps, outcomes, routes, stepOrder, outcomeOrder, setProcess, setPublishing, setValidationResults]);

  return { isPublishing, publish, error };
}

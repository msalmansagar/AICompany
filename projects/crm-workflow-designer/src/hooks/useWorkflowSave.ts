import { useState, useCallback } from 'react';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import { assertGuid, isTemporaryId } from '@/services/assertGuid';
import { AuditService } from '@/services/AuditService';

interface UseSaveResult {
  isSaving: boolean;
  save: () => Promise<void>;
  error: string | null;
}

export function useWorkflowSave(): UseSaveResult {
  const adapter = useCrmAdapter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    process,
    steps,
    outcomes,
    routes,
    newIds,
    dirtyIds,
    deletedIds,
    deletedEntityTypes,
    resolveTemporaryId,
    markClean,
  } = useWorkflowStore((s) => ({
    process: s.process,
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    newIds: s.newIds,
    dirtyIds: s.dirtyIds,
    deletedIds: s.deletedIds,
    deletedEntityTypes: s.deletedEntityTypes,
    resolveTemporaryId: s.resolveTemporaryId,
    markClean: s.markClean,
  }));

  const save = useCallback(async () => {
    if (!process) {
      setError('No process loaded. Cannot save.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 1. Save process header
      if (!isTemporaryId(process.crmId)) {
        assertGuid(process.crmId, 'process.crmId');
        await adapter.updateProcess(process.crmId, {
          name: process.name,
          recordEntity: process.recordEntity,
          regardingField: process.regardingField,
          parentEntity: process.parentEntity,
          versionMajor: process.versionMajor,
          versionMinor: process.versionMinor,
          workflowState: process.workflowState,
          snapshot: process.snapshot,
        });
      }

      // 2. Save steps (create new, update dirty)
      const stepIdMap: Record<string, string> = {};

      for (const step of Object.values(steps)) {
        if (isTemporaryId(step.crmId) || newIds.includes(step.crmId)) {
          const newId = await adapter.createStep({
            ...step,
            processId: process.crmId,
          });
          stepIdMap[step.crmId] = newId;
          resolveTemporaryId(step.crmId, newId, 'step');
        } else if (dirtyIds.includes(step.crmId)) {
          assertGuid(step.crmId, 'step.crmId');
          await adapter.updateStep(step.crmId, step);
        }
      }

      // 3. Save outcomes
      const outcomeIdMap: Record<string, string> = {};

      for (const outcome of Object.values(outcomes)) {
        const resolvedStepId = stepIdMap[outcome.stepId] ?? outcome.stepId;

        if (isTemporaryId(outcome.crmId) || newIds.includes(outcome.crmId)) {
          const newId = await adapter.createOutcome({
            ...outcome,
            stepId: resolvedStepId,
          });
          outcomeIdMap[outcome.crmId] = newId;
          resolveTemporaryId(outcome.crmId, newId, 'outcome');
        } else if (dirtyIds.includes(outcome.crmId)) {
          assertGuid(outcome.crmId, 'outcome.crmId');
          await adapter.updateOutcome(outcome.crmId, outcome);
        }
      }

      // 4. Save routes
      for (const route of Object.values(routes)) {
        const resolvedOutcomeId = outcomeIdMap[route.outcomeId] ?? route.outcomeId;
        const resolvedNextStepId = stepIdMap[route.nextStepId] ?? route.nextStepId;

        if (isTemporaryId(route.crmId) || newIds.includes(route.crmId)) {
          assertGuid(resolvedOutcomeId, 'route.outcomeId');
          assertGuid(resolvedNextStepId, 'route.nextStepId');
          const newId = await adapter.createRoute({
            ...route,
            outcomeId: resolvedOutcomeId,
            nextStepId: resolvedNextStepId,
          });
          resolveTemporaryId(route.crmId, newId, 'route');
        } else if (dirtyIds.includes(route.crmId)) {
          assertGuid(route.crmId, 'route.crmId');
          await adapter.updateRoute(route.crmId, route);
        }
      }

      // 5. Process deletions
      for (const deletedId of deletedIds) {
        if (isTemporaryId(deletedId)) continue;
        assertGuid(deletedId, 'deletedId');

        const entityType = deletedEntityTypes[deletedId];
        if (entityType === 'step') await adapter.deleteStep(deletedId);
        else if (entityType === 'outcome') await adapter.deleteOutcome(deletedId);
        else if (entityType === 'route') await adapter.deleteRoute(deletedId);
      }

      // 6. Audit
      const auditService = new AuditService(adapter);
      await auditService.log('SAVE_DRAFT', process.crmId, {
        stepCount: Object.keys(steps).length,
      });

      markClean();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }, [
    adapter,
    process,
    steps,
    outcomes,
    routes,
    newIds,
    dirtyIds,
    deletedIds,
    deletedEntityTypes,
    resolveTemporaryId,
    markClean,
  ]);

  return { isSaving, save, error };
}

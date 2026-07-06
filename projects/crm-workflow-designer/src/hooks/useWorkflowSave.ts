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
    nodePositions,
    resolveTemporaryId,
    resolveProcessId,
    markClean,
    showToast,
  } = useWorkflowStore((s) => ({
    process: s.process,
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    newIds: s.newIds,
    dirtyIds: s.dirtyIds,
    deletedIds: s.deletedIds,
    deletedEntityTypes: s.deletedEntityTypes,
    nodePositions: s.nodePositions,
    resolveTemporaryId: s.resolveTemporaryId,
    resolveProcessId: s.resolveProcessId,
    markClean: s.markClean,
    showToast: s.showToast,
  }));

  const save = useCallback(async () => {
    if (!process) {
      setError('No process loaded. Cannot save.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 1. Create or update process
      let resolvedProcessId = process.crmId;

      if (isTemporaryId(process.crmId)) {
        resolvedProcessId = await adapter.createProcess({
          name: process.name,
          recordEntity: process.recordEntity,
          recordEntityName: process.recordEntityName,
          regardingField: process.regardingField,
          parentEntity: process.parentEntity,
          parentEntityName: process.parentEntityName,
          versionMajor: process.versionMajor,
          versionMinor: process.versionMinor,
          workflowState: 'draft',
          snapshot: null,
        });
        // Update store with real CRM id (no dirty mark — we're mid-save)
        resolveProcessId(resolvedProcessId);
      } else {
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

      // 2. Save steps — create new, update dirty
      const stepIdMap: Record<string, string> = {};

      for (const step of Object.values(steps)) {
        if (isTemporaryId(step.crmId) || newIds.includes(step.crmId)) {
          const newId = await adapter.createStep({
            ...step,
            processId: resolvedProcessId,
            // Inherit entity/field references from the parent process
            recordEntityId: step.recordEntityId ?? process.recordEntity ?? null,
            regardingFieldId: step.regardingFieldId ?? process.regardingField ?? null,
            parentEntityId: step.parentEntityId ?? process.parentEntity ?? null,
          });
          stepIdMap[step.crmId] = newId;
          resolveTemporaryId(step.crmId, newId, 'step');
        } else if (dirtyIds.includes(step.crmId)) {
          assertGuid(step.crmId, 'step.crmId');
          await adapter.updateStep(step.crmId, step);
        }
      }

      // 3. Save outcomes — create new, update dirty
      const outcomeIdMap: Record<string, string> = {};

      for (const outcome of Object.values(outcomes)) {
        const resolvedStepId = stepIdMap[outcome.stepId] ?? outcome.stepId;
        if (!resolvedStepId || isTemporaryId(resolvedStepId)) continue; // skip orphaned

        if (isTemporaryId(outcome.crmId) || newIds.includes(outcome.crmId)) {
          const resolvedNextStepId = outcome.nextStepId
            ? (stepIdMap[outcome.nextStepId] ?? outcome.nextStepId)
            : null;
          const newId = await adapter.createOutcome({
            ...outcome,
            stepId: resolvedStepId,
            nextStepId: resolvedNextStepId,
          });
          outcomeIdMap[outcome.crmId] = newId;
          resolveTemporaryId(outcome.crmId, newId, 'outcome');
        } else if (dirtyIds.includes(outcome.crmId)) {
          assertGuid(outcome.crmId, 'outcome.crmId');
          await adapter.updateOutcome(outcome.crmId, outcome);
        }
      }

      // 4. Save routes — create new, update dirty
      for (const route of Object.values(routes)) {
        const resolvedOutcomeId = outcomeIdMap[route.outcomeId] ?? route.outcomeId;
        const resolvedNextStepId = route.nextStepId ? (stepIdMap[route.nextStepId] ?? route.nextStepId) : null;

        if (!resolvedOutcomeId || !resolvedNextStepId) continue;
        if (isTemporaryId(resolvedOutcomeId) || isTemporaryId(resolvedNextStepId)) continue;

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

      // 5. Save node positions into the workflow snapshot
      const positionPayload = JSON.stringify(nodePositions);
      if (!isTemporaryId(resolvedProcessId)) {
        await adapter.updateProcess(resolvedProcessId, { snapshot: positionPayload });
      }

      // 6. Process deletions
      for (const deletedId of deletedIds) {
        if (isTemporaryId(deletedId)) continue;
        assertGuid(deletedId, 'deletedId');
        const entityType = deletedEntityTypes[deletedId];
        if (entityType === 'step') await adapter.deleteStep(deletedId);
        else if (entityType === 'outcome') await adapter.deleteOutcome(deletedId);
        else if (entityType === 'route') await adapter.deleteRoute(deletedId);
      }

      // 7. Audit
      if (!isTemporaryId(resolvedProcessId)) {
        const auditService = new AuditService(adapter);
        await auditService.log('SAVE_DRAFT', resolvedProcessId, {
          stepCount: Object.keys(steps).length,
        });
      }

      markClean();
      showToast('Workflow saved successfully.', 'success');
    } catch (err) {
      const message = extractCrmMessage(err);
      console.error('[useWorkflowSave] Save failed:', err);
      setError(message);
      showToast(`Save failed: ${message}`, 'error');
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
    nodePositions,
    resolveTemporaryId,
    resolveProcessId,
    markClean,
    showToast,
  ]);

  return { isSaving, save, error };
}

function extractCrmMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj['message'] === 'string') return obj['message'];
    return JSON.stringify(obj);
  }
  return String(err);
}

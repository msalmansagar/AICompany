import { emptyWorkflowHooks, PROCESS_HOOKS } from '@/services/workflowHooks';
import { mergeDesignerLayout } from '@/services/designerLayout';
import { useState, useCallback } from 'react';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import { assertGuid, isTemporaryId } from '@/services/assertGuid';
import { AuditService } from '@/services/AuditService';
import { logError } from '@/services/logError';
import { planRouteSave, describeBlockedRoutes } from '@/services/routeSavePlanner';
import { findSaveBlockers, describeSaveBlockers } from '@/services/saveBlockers';
import { findStepsWithoutDecision, describeStepDecisionBlockers } from '@/services/stepDecisionRules';

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

    // Two kinds of refusal, both before the first write: states the server would
    // reject, and a process that would stall on a step offering no decision.
    const strandedSteps = findStepsWithoutDecision({ steps, outcomes });
    const saveBlockers = findSaveBlockers({ outcomes, routes });
    const blockerMessage =
      describeStepDecisionBlockers(strandedSteps) ?? describeSaveBlockers(saveBlockers);
    if (blockerMessage) {
      setError(blockerMessage);
      showToast(blockerMessage, 'error');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Anything that could not be written, so the save never reports a clean
      // success while having discarded work.
      const blocked: { name: string; reason: string }[] = [];

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
          workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
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
        if (!resolvedStepId || isTemporaryId(resolvedStepId)) {
          blocked.push({ name: outcome.name, reason: 'its step was not saved' });
          continue;
        }

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

      // 4. Save routes — a route with no next step is legal and must persist;
      // anything genuinely unwritable is collected rather than dropped.
      for (const route of Object.values(routes)) {
        const plan = planRouteSave(route, { outcomeIdMap, stepIdMap, newIds, dirtyIds });

        if (plan.action === 'blocked') {
          blocked.push({ name: route.name, reason: plan.reason });
          continue;
        }
        if (plan.action === 'unchanged') continue;

        assertGuid(plan.ids.outcomeId, 'route.outcomeId');
        if (plan.ids.nextStepId) assertGuid(plan.ids.nextStepId, 'route.nextStepId');

        if (plan.action === 'create') {
          const newId = await adapter.createRoute({
            ...route,
            outcomeId: plan.ids.outcomeId,
            nextStepId: plan.ids.nextStepId,
          });
          resolveTemporaryId(route.crmId, newId, 'route');
        } else {
          assertGuid(route.crmId, 'route.crmId');
          await adapter.updateRoute(route.crmId, {
            ...route,
            outcomeId: plan.ids.outcomeId,
            nextStepId: plan.ids.nextStepId,
          });
        }
      }

      // 5. Persist the designer layout. The old snapshot write silently did
      // nothing: buildProcessBody only maps qdb_name, so the PATCH body was
      // empty — positions were never stored. The layout now lives in an
      // annotation on the process. Read fresh state: the temp ids were
      // resolved above and the store remapped the keys.
      if (!isTemporaryId(resolvedProcessId)) {
        const fresh = useWorkflowStore.getState();
        try {
          const existingLayout = await adapter.loadDesignerLayout(resolvedProcessId).catch(() => null);
          await adapter.saveDesignerLayout(
            resolvedProcessId,
            // Merge: the view canvases keep their own positions in this blob.
            mergeDesignerLayout(existingLayout, {
              nodePositions: fresh.nodePositions,
              edgeAnchors: fresh.edgeAnchors,
              labelOffsets: fresh.labelOffsets,
            })
          );
        } catch (layoutError) {
          // Layout is cosmetic — its failure must not fail the save.
          logError('save:designer-layout', layoutError);
        }
      }

      // 6. Process deletions (each recorded to the audit log)
      const auditService = new AuditService(adapter);
      for (const deletedId of deletedIds) {
        if (isTemporaryId(deletedId)) continue;
        assertGuid(deletedId, 'deletedId');
        const entityType = deletedEntityTypes[deletedId];
        if (entityType === 'step') await adapter.deleteStep(deletedId);
        else if (entityType === 'outcome') await adapter.deleteOutcome(deletedId);
        else if (entityType === 'route') await adapter.deleteRoute(deletedId);
        else continue;
        await auditService.log('DELETE', deletedId, { entityType });
      }

      // 7. Audit
      if (!isTemporaryId(resolvedProcessId)) {
        await auditService.log('SAVE_DRAFT', resolvedProcessId, {
          stepCount: Object.keys(steps).length,
        });
      }

      const blockedMessage = describeBlockedRoutes(blocked);
      if (blockedMessage) {
        setError(blockedMessage);
        showToast(blockedMessage, 'error');
        return;
      }

      markClean();
      showToast('Workflow saved successfully.', 'success');
    } catch (err) {
      const message = extractCrmMessage(err);
      logError('useWorkflowSave', err);
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

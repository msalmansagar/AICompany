// src/hooks/useSopSave.ts
import { useCallback } from 'react';
import { useSopStore } from '@/store/sopStore';
import type { SopStore } from '@/store/sopStore';
import { useSopAdapter } from './useSopAdapter';

type Adapter = ReturnType<typeof useSopAdapter>;

// Always reads current zustand state — safe to call after any mutation.
function getState(): SopStore {
  return useSopStore.getState() as unknown as SopStore;
}

/**
 * Executes the dependency-ordered SOP canvas save pipeline.
 * Phase 1: SOP record  → Phase 2: SOP steps (need real sopId from phase 1)
 * Phase 3: SOP outcomes (need real stepIds from phase 2)
 * Phase 4: Deletions
 *
 * Each phase calls getState() so it sees mutations made by earlier phases
 * (e.g. the real sopId written by setSop before steps are created).
 */
export function useSopSave() {
  const adapter = useSopAdapter();

  const saveSopCanvas = useCallback(async () => {
    getState().setIsSaving(true);
    try {
      await saveSopRecord(adapter);
      await saveSopSteps(adapter);
      await saveSopOutcomes(adapter);
      await executeSopDeletions(adapter);
      getState().markSaved();
    } finally {
      getState().setIsSaving(false);
    }
  }, [adapter]);

  return { saveSopCanvas };
}

async function saveSopRecord(adapter: Adapter) {
  const { sop, newIds, dirtyIds } = getState();
  if (!sop) return;

  if (newIds.has(sop.id)) {
    const realId = await adapter.createSop({
      name: sop.name,
      description: sop.description,
      purpose: sop.purpose,
      version: sop.version,
      recordTypeId: sop.recordTypeId,
    });
    getState().setSop({ ...sop, id: realId });
  } else if (dirtyIds.includes(sop.id)) {
    await adapter.updateSop(sop.id, {
      name: sop.name,
      description: sop.description,
      purpose: sop.purpose,
      version: sop.version,
      status: sop.status,
      recordTypeId: sop.recordTypeId,
    });
  }
}

async function saveSopSteps(adapter: Adapter) {
  // Read FRESH state — sop.id is now the real Dataverse ID after saveSopRecord.
  const { steps, stepOrder, newIds, dirtyIds, sop } = getState();
  if (!sop) return;

  for (const stepId of stepOrder) {
    const step = steps[stepId];
    if (!step) continue;

    if (newIds.has(stepId)) {
      const realId = await adapter.createSopStep({
        name: step.name,
        description: step.description,
        sequenceNo: step.sequenceNo,
        sopId: sop.id,
        roleId: step.roleId,
        stepType: step.stepType ?? 'step',
        executionChannel: step.executionChannel ?? null,
        decisionLabel: step.decisionLabel ?? null,
      });
      getState().resolveTmpId(stepId, realId, 'sopstep');
    } else if (dirtyIds.includes(stepId)) {
      await adapter.updateSopStep(stepId, {
        name: step.name,
        description: step.description,
        sequenceNo: step.sequenceNo,
        roleId: step.roleId,
        stepType: step.stepType ?? 'step',
        executionChannel: step.executionChannel ?? null,
        decisionLabel: step.decisionLabel ?? null,
      });
    }
  }
}

async function saveSopOutcomes(adapter: Adapter) {
  // Read FRESH state — outcome.sopStepId values are now real IDs after saveSopSteps.
  const { outcomes, newIds, dirtyIds } = getState();

  for (const outcome of Object.values(outcomes)) {
    if (newIds.has(outcome.id)) {
      const realId = await adapter.createSopOutcome({
        name: outcome.name,
        sequenceNo: outcome.sequenceNo,
        sopStepId: outcome.sopStepId,
        nextSopStepId: outcome.nextSopStepId,
      });
      getState().resolveTmpId(outcome.id, realId, 'sopoutcome');
    } else if (dirtyIds.includes(outcome.id)) {
      await adapter.updateSopOutcome(outcome.id, {
        name: outcome.name,
        sequenceNo: outcome.sequenceNo,
        nextSopStepId: outcome.nextSopStepId,
      });
    }
  }
}

async function executeSopDeletions(adapter: Adapter) {
  const { deletedIds, deletedEntityTypes } = getState();

  const outcomeIds = deletedIds.filter((id) => deletedEntityTypes[id] === 'sopoutcome');
  const stepIds    = deletedIds.filter((id) => deletedEntityTypes[id] === 'sopstep');

  for (const id of outcomeIds) {
    await adapter.deleteSopOutcome(id);
  }
  for (const id of stepIds) {
    await adapter.deleteSopStep(id);
  }
}

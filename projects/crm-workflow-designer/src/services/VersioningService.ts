import type { WorkflowProcess } from '@/types/WorkflowTypes';
import type { WorkflowDesignerState } from '@/store/workflowStore';

export interface VersionedProcess {
  versionMajor: number;
  versionMinor: number;
}

export class VersioningService {
  incrementMinor(process: WorkflowProcess): VersionedProcess {
    return {
      versionMajor: process.versionMajor,
      versionMinor: process.versionMinor + 1,
    };
  }

  incrementMajor(process: WorkflowProcess): VersionedProcess {
    return {
      versionMajor: process.versionMajor + 1,
      versionMinor: 0,
    };
  }

  isBreakingChange(
    oldSnapshot: string | null,
    currentState: Pick<WorkflowDesignerState, 'steps' | 'outcomes'>
  ): boolean {
    if (!oldSnapshot) return false;

    try {
      const old = JSON.parse(oldSnapshot) as {
        stepCount?: number;
        outcomeCount?: number;
      };

      const currentStepCount = Object.keys(currentState.steps).length;
      const currentOutcomeCount = Object.keys(currentState.outcomes).length;

      const stepCountDecreased = typeof old.stepCount === 'number' && currentStepCount < old.stepCount;
      const outcomeCountDecreased =
        typeof old.outcomeCount === 'number' && currentOutcomeCount < old.outcomeCount;

      return stepCountDecreased || outcomeCountDecreased;
    } catch {
      return false;
    }
  }

  createSnapshot(
    state: Pick<WorkflowDesignerState, 'process' | 'steps' | 'outcomes' | 'routes' | 'nodePositions'>
  ): string {
    const snapshot = {
      processId: state.process?.crmId ?? '',
      processName: state.process?.name ?? '',
      stepCount: Object.keys(state.steps).length,
      outcomeCount: Object.keys(state.outcomes).length,
      routeCount: Object.keys(state.routes).length,
      steps: Object.values(state.steps).map((s) => ({
        id: s.crmId,
        name: s.name,
        sequenceNo: s.sequenceNo,
        position: state.nodePositions[s.crmId] ?? { x: 0, y: 0 },
      })),
      outcomes: Object.values(state.outcomes).map((o) => ({
        id: o.crmId,
        name: o.name,
        stepId: o.stepId,
      })),
      routes: Object.values(state.routes).map((r) => ({
        id: r.crmId,
        outcomeId: r.outcomeId,
        nextStepId: r.nextStepId,
      })),
      snapshotAt: new Date().toISOString(),
    };
    return JSON.stringify(snapshot);
  }
}

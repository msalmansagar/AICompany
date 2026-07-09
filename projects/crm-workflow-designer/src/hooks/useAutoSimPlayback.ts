import { useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { enumerateAllPaths } from '@/services/PathEnumerator';

const STEP_MS: Record<string, number> = { slow: 1500, normal: 800, fast: 300 };
const HOLD_MS: Record<string, number> = { slow: 1000, normal: 600, fast: 200 };

export function useAutoSimPlayback(): void {
  const isAutoSimulating = useWorkflowStore((s) => s.isAutoSimulating);
  const autoSimPhase = useWorkflowStore((s) => s.autoSimPhase);
  const autoSimSpeed = useWorkflowStore((s) => s.autoSimSpeed);
  const autoSimCurrentPathIndex = useWorkflowStore((s) => s.autoSimCurrentPathIndex);
  const autoSimCurrentStepIndex = useWorkflowStore((s) => s.autoSimCurrentStepIndex);
  const currentPathStepCount = useWorkflowStore(
    (s) => s.autoSimPaths[s.autoSimCurrentPathIndex]?.steps.length ?? 0
  );
  const autoSimPathCount = useWorkflowStore((s) => s.autoSimPaths.length);

  // Enumerate paths and kick off playback when auto sim starts
  useEffect(() => {
    if (!isAutoSimulating || autoSimPhase !== null) return;
    const { stepOrder, steps, outcomes, outcomeOrder, routes, routeOrder, initAutoSimPlayback, autoSimFinish } =
      useWorkflowStore.getState();
    const entryStepId = stepOrder[0];
    if (!entryStepId) {
      autoSimFinish();
      return;
    }
    const paths = enumerateAllPaths(entryStepId, steps, outcomes, outcomeOrder, routes, routeOrder);
    if (paths.length === 0) {
      autoSimFinish();
      return;
    }
    initAutoSimPlayback(paths);
  }, [isAutoSimulating, autoSimPhase]);

  // Advance one step at a time during 'playing' phase
  useEffect(() => {
    if (autoSimPhase !== 'playing') return;
    const { autoSimAdvanceStep, autoSimBeginHold } = useWorkflowStore.getState();

    const timer = setTimeout(() => {
      if (autoSimCurrentStepIndex + 1 < currentPathStepCount) {
        autoSimAdvanceStep();
      } else {
        autoSimBeginHold();
      }
    }, STEP_MS[autoSimSpeed] ?? 800);

    return () => clearTimeout(timer);
  }, [autoSimPhase, autoSimCurrentPathIndex, autoSimCurrentStepIndex, autoSimSpeed, currentPathStepCount]);

  // After hold, start next path or finish
  useEffect(() => {
    if (autoSimPhase !== 'holding') return;
    const { autoSimBeginNextPath, autoSimFinish } = useWorkflowStore.getState();

    const timer = setTimeout(() => {
      if (autoSimCurrentPathIndex + 1 < autoSimPathCount) {
        autoSimBeginNextPath();
      } else {
        autoSimFinish();
      }
    }, HOLD_MS[autoSimSpeed] ?? 600);

    return () => clearTimeout(timer);
  }, [autoSimPhase, autoSimCurrentPathIndex, autoSimSpeed, autoSimPathCount]);
}

import type { WorkflowStep, WorkflowOutcome } from '@/types/WorkflowTypes';
import type { SimPath } from './PathEnumerator';

export type ComplexityLevel = 'green' | 'yellow' | 'red';

export interface ComplexityMetric {
  label: string;
  value: number;
  level: ComplexityLevel;
  greenRange: string;
  yellowRange: string;
  redRange: string;
}

export interface ComplexityIndex {
  totalSteps: ComplexityMetric;
  totalDecisions: ComplexityMetric;
  totalReturnPaths: ComplexityMetric;
  maxPathDepth: ComplexityMetric;
  overallLevel: ComplexityLevel;
}

export function analyzeComplexity(
  stepOrder: string[],
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  outcomeOrder: Record<string, string[]>,
  paths: SimPath[]
): ComplexityIndex {
  const totalSteps = stepOrder.length;

  const totalDecisions = stepOrder.filter(
    (stepId) => (outcomeOrder[stepId] ?? []).length >= 2
  ).length;

  const totalReturnPaths = Object.values(outcomes).filter((outcome) => {
    if (!outcome.nextStepId) return false;
    const src = steps[outcome.stepId];
    const tgt = steps[outcome.nextStepId];
    return src && tgt && tgt.sequenceNo < src.sequenceNo;
  }).length;

  const maxPathDepth = paths.reduce((max, p) => Math.max(max, p.steps.length), 0);

  const stepsMetric = buildMetric('Total Steps', totalSteps, stepsLevel(totalSteps), '<20', '20–40', '>40');
  const decisionsMetric = buildMetric('Total Decisions', totalDecisions, decisionsLevel(totalDecisions), '<5', '5–10', '>10');
  const returnMetric = buildMetric('Return Paths', totalReturnPaths, returnLevel(totalReturnPaths), '<3', '3–5', '>5');
  const depthMetric = buildMetric('Max Path Depth', maxPathDepth, depthLevel(maxPathDepth), '<8', '8–12', '>12');

  const overallLevel = worstLevel([
    stepsMetric.level,
    decisionsMetric.level,
    returnMetric.level,
    depthMetric.level,
  ]);

  return {
    totalSteps: stepsMetric,
    totalDecisions: decisionsMetric,
    totalReturnPaths: returnMetric,
    maxPathDepth: depthMetric,
    overallLevel,
  };
}

function buildMetric(
  label: string,
  value: number,
  level: ComplexityLevel,
  greenRange: string,
  yellowRange: string,
  redRange: string
): ComplexityMetric {
  return { label, value, level, greenRange, yellowRange, redRange };
}

function stepsLevel(v: number): ComplexityLevel {
  if (v < 20) return 'green';
  if (v <= 40) return 'yellow';
  return 'red';
}

function decisionsLevel(v: number): ComplexityLevel {
  if (v < 5) return 'green';
  if (v <= 10) return 'yellow';
  return 'red';
}

function returnLevel(v: number): ComplexityLevel {
  if (v < 3) return 'green';
  if (v <= 5) return 'yellow';
  return 'red';
}

function depthLevel(v: number): ComplexityLevel {
  if (v < 8) return 'green';
  if (v <= 12) return 'yellow';
  return 'red';
}

function worstLevel(levels: ComplexityLevel[]): ComplexityLevel {
  if (levels.includes('red')) return 'red';
  if (levels.includes('yellow')) return 'yellow';
  return 'green';
}

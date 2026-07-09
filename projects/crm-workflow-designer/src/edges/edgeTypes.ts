import type { EdgeTypes } from '@xyflow/react';
import { SmoothStepEdge } from '@xyflow/react';
import { RouteEdge } from './RouteEdge';
import { OutcomeEdge } from './OutcomeEdge';
import { EditBackEdge } from './EditBackEdge';

export const edgeTypes: EdgeTypes = {
  route: RouteEdge,
  stepToOutcome: SmoothStepEdge,
  outcome: OutcomeEdge,
  editBack: EditBackEdge,
};

import type { EdgeTypes } from '@xyflow/react';
import { SmoothStepEdge } from '@xyflow/react';
import { RouteEdge } from './RouteEdge';

export const edgeTypes: EdgeTypes = {
  route: RouteEdge,
  stepToOutcome: SmoothStepEdge,
};

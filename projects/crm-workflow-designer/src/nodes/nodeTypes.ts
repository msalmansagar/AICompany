import type { NodeTypes } from '@xyflow/react';
import { StartNode } from './StartNode';
import { StepNode } from './StepNode';
import { OutcomeNode } from './OutcomeNode';
import { EndNode } from './EndNode';

export const nodeTypes: NodeTypes = {
  start: StartNode,
  step: StepNode,
  outcome: OutcomeNode,
  end: EndNode,
};

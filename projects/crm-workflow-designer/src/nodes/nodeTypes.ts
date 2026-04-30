import type { NodeTypes } from '@xyflow/react';
import { TriggerNode } from './TriggerNode';
import { ConditionNode } from './ConditionNode';
import { ActionNode } from './ActionNode';
import { ApprovalNode } from './ApprovalNode';
import { EndNode } from './EndNode';

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  approval: ApprovalNode,
  end: EndNode,
};

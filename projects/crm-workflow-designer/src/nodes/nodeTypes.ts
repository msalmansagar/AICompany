import type { NodeTypes } from '@xyflow/react';
import { StartNode } from './StartNode';
import { StepNode } from './StepNode';
import { OutcomeNode } from './OutcomeNode';
import { EndNode } from './EndNode';
import { ViewStepNode } from './ViewStepNode';
import { ViewOutcomeNode } from './ViewOutcomeNode';
import { ViewStartNode } from './ViewStartNode';
import { ViewEndNode } from './ViewEndNode';
import { ViewDecisionNode } from './ViewDecisionNode';
import { ExecStepNode } from './ExecStepNode';
import { TechStepNode } from './TechStepNode';
import { SwimlaneNode, SwimStepNode } from './SwimlaneNode';
import { EditStepNode } from './EditStepNode';

export const nodeTypes: NodeTypes = {
  // Legacy edit-mode nodes (kept for compatibility)
  start: StartNode,
  step: StepNode,
  outcome: OutcomeNode,
  end: EndNode,

  // View mode — shared start/end
  viewStart: ViewStartNode,
  viewEnd: ViewEndNode,

  // Business view
  viewStep: ViewStepNode,
  viewOutcome: ViewOutcomeNode,
  viewDecision: ViewDecisionNode,

  // Executive view
  execStep: ExecStepNode,

  // Technical view
  techStep: TechStepNode,

  // Swimlane view
  swimlane: SwimlaneNode,
  swimStep: SwimStepNode,

  // Edit mode
  editStep: EditStepNode,
};

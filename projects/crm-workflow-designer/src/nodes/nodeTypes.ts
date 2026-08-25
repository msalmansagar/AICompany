import type { NodeTypes } from '@xyflow/react';
import { ViewStepNode } from './ViewStepNode';
import { ViewOutcomeNode } from './ViewOutcomeNode';
import { ViewStartNode } from './ViewStartNode';
import { ViewEndNode } from './ViewEndNode';
import { ViewDecisionNode } from './ViewDecisionNode';
import { ExecStepNode } from './ExecStepNode';
import { SwimlaneNode, SwimStepNode } from './SwimlaneNode';
import { EditStepNode } from './EditStepNode';
import { SimStepNode } from './SimStepNode';
import { SopStepNode } from './SopStepNode';
import { SopOutcomeNode } from './SopOutcomeNode';
import { SopGatewayNode } from './SopGatewayNode';
import { SopStartNode } from './SopStartNode';
import { SopEndNode } from './SopEndNode';
import { SopSwimlaneNode } from './SopSwimlaneNode';
import { TechNewStepNode } from './TechNewStepNode';
import { TechNewOutcomeNode } from './TechNewOutcomeNode';
import { RouteGatewayNode } from './RouteGatewayNode';
import { StageBandNode } from './StageBandNode';

export const nodeTypes: NodeTypes = {
  // View mode — shared start/end
  viewStart: ViewStartNode,
  viewEnd: ViewEndNode,

  // Business view
  viewStep: ViewStepNode,
  stageBand: StageBandNode,
  viewOutcome: ViewOutcomeNode,
  viewDecision: ViewDecisionNode,

  // Executive view
  execStep: ExecStepNode,

  // Technical (New) view
  techNewStep: TechNewStepNode,
  techNewOutcome: TechNewOutcomeNode,

  // Swimlane view
  swimlane: SwimlaneNode,
  swimStep: SwimStepNode,

  // Edit mode
  editStep: EditStepNode,
  routeGateway: RouteGatewayNode,

  // Simulation mode
  simStep: SimStepNode,

  // SOP Designer
  sopStep: SopStepNode,
  sopOutcome: SopOutcomeNode,
  sopGateway: SopGatewayNode,
  sopStart: SopStartNode,
  sopEnd: SopEndNode,
  sopSwimlane: SopSwimlaneNode,
};

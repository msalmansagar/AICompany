export interface WorkflowDefinition {
  version: '1.0';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export type NodeType = 'trigger' | 'condition' | 'action' | 'approval' | 'end';

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: 'true' | 'false';
}

export interface TriggerNodeData {
  entity: string;
  event: 'created' | 'updated' | 'deleted';
  filterField?: string;
  filterOperator?: CompareOperator;
  filterValue?: string;
}

export interface ConditionNodeData {
  field: string;
  operator: CompareOperator;
  value?: string;
}

export type CompareOperator =
  | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le'
  | 'contains' | 'beginswith' | 'null' | 'notnull';

export interface UpdateFieldAction {
  actionType: 'updateField';
  entity: string;
  field: string;
  value: string;
}

export interface CreateRecordAction {
  actionType: 'createRecord';
  entity: string;
  fieldMappings: Array<{ field: string; value: string }>;
}

export interface SendEmailAction {
  actionType: 'sendEmail';
  templateId: string;
  recipientField: string;
}

export interface AssignAction {
  actionType: 'assign';
  assignToType: 'user' | 'team';
  assignToId: string;
  assignToName: string;
}

export interface WaitAction {
  actionType: 'wait';
  durationMinutes: number;
}

export type ActionNodeData =
  | UpdateFieldAction
  | CreateRecordAction
  | SendEmailAction
  | AssignAction
  | WaitAction;

export interface ApprovalNodeData {
  assignToType: 'user' | 'team';
  assignToId: string;
  assignToName: string;
  approvalField: string;
  approvedValue: string;
  rejectedValue: string;
}

export type NodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | ApprovalNodeData
  | Record<string, never>;

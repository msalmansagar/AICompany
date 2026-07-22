// src/types/SopTypes.ts
import type { SlaFields } from './WorkflowTypes';

export type SopExecutionChannel = 'crm' | 'manual';

export type SopStepType =
  | 'step'
  | 'approval'
  | 'milestone'
  | 'manual'
  | 'system'
  | 'notification'
  | 'wait'
  | 'subprocess';

export const SOP_STEP_TYPE_OPTION_VALUE: Record<SopStepType, number> = {
  step:         100000000,
  approval:     100000002,
  milestone:    100000003,
  manual:       100000004,
  system:       100000005,
  notification: 100000006,
  wait:         100000007,
  subprocess:   100000008,
};

export const SOP_STEP_TYPE_FROM_OPTION_VALUE: Record<number, SopStepType> = {
  100000000: 'step',
  100000002: 'approval',
  100000003: 'milestone',
  100000004: 'manual',
  100000005: 'system',
  100000006: 'notification',
  100000007: 'wait',
  100000008: 'subprocess',
};

export const SOP_STEP_TYPE_META: Record<SopStepType, { label: string; accent: string; icon: string }> = {
  step:         { label: 'Step',          accent: '#0f766e', icon: '' },
  approval:     { label: 'Approval',      accent: '#4f46e5', icon: '✓' },
  milestone:    { label: 'Milestone',     accent: '#d97706', icon: '◆' },
  manual:       { label: 'Manual',        accent: '#2563eb', icon: '✋' },
  system:       { label: 'System',        accent: '#7c3aed', icon: '⚙' },
  notification: { label: 'Notification',  accent: '#ea580c', icon: '◉' },
  wait:         { label: 'Wait State',    accent: '#64748b', icon: '◷' },
  subprocess:   { label: 'Sub-process',   accent: '#be185d', icon: '⊡' },
};

export const SOP_STATUS = {
  DRAFT: 100000000,
  PUBLISHED: 100000001,
  RETIRED: 100000002,
} as const;

export type SopStatus = typeof SOP_STATUS[keyof typeof SOP_STATUS];

export const ROLE_STATUS = {
  ACTIVE: 100000000,
  INACTIVE: 100000001,
} as const;

export type RoleStatus = typeof ROLE_STATUS[keyof typeof ROLE_STATUS];

export interface CrmRole {
  id: string;
  name: string;
  description: string;
  department: string;
  status: RoleStatus;
}

export interface SopSummary {
  id: string;
  name: string;
  status: SopStatus;
  version: string;
  recordTypeId: string | null;
  recordTypeName: string | null;
  derivedProcessCount: number;
}

export interface Sop {
  id: string;
  name: string;
  description: string;
  purpose: string;
  status: SopStatus;
  version: string;
  recordTypeId: string | null;
  recordTypeName: string | null;
}

export interface SopStep extends SlaFields {
  id: string;
  name: string;
  description: string;
  sequenceNo: number;
  sopId: string;
  roleId: string | null;
  roleName: string | null;
  roleStatus: RoleStatus | null;
  stepType: SopStepType;
  executionChannel?: SopExecutionChannel | null;
  decisionLabel?: string | null;
}

export interface SopOutcome {
  id: string;
  name: string;
  sequenceNo: number;
  sopStepId: string;
  nextSopStepId: string | null;
}

// --- Request types ---

export interface CreateRoleRequest {
  name: string;
  description: string;
  department: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  department?: string;
  status?: RoleStatus;
}

export interface CreateSopRequest {
  name: string;
  description: string;
  purpose: string;
  version: string;
  recordTypeId: string | null;
}

export interface UpdateSopRequest {
  name?: string;
  description?: string;
  purpose?: string;
  version?: string;
  status?: SopStatus;
  recordTypeId?: string | null;
}

export interface CreateSopStepRequest {
  name: string;
  description: string;
  sequenceNo: number;
  sopId: string;
  roleId: string | null;
  stepType: SopStepType;
  executionChannel?: SopExecutionChannel | null;
  decisionLabel?: string | null;
}

export interface UpdateSopStepRequest {
  name?: string;
  description?: string;
  sequenceNo?: number;
  roleId?: string | null;
  stepType?: SopStepType;
  executionChannel?: SopExecutionChannel | null;
  decisionLabel?: string | null;
}

export interface CreateSopOutcomeRequest {
  name: string;
  sequenceNo: number;
  sopStepId: string;
  nextSopStepId: string | null;
}

export interface UpdateSopOutcomeRequest {
  name?: string;
  sequenceNo?: number;
  nextSopStepId?: string | null;
}

export interface StepAssignment {
  sopStepId: string;
  taskSubject: string;
  assignToType: number | null;
  assignedUserId?: string;
  teamId?: string;
  enableRoundRobin: boolean;
  roundRobinTeamId?: string;
}

export interface CreateProcessFromSopRequest {
  sopId: string;
  processName: string;
  processDescription: string;
  taskEntity: string;
  regardingField: string;
  parentEntity: string;
  stepAssignments: StepAssignment[];
}

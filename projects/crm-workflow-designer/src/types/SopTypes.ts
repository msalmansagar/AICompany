// src/types/SopTypes.ts

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

export interface SopStep {
  id: string;
  name: string;
  description: string;
  sequenceNo: number;
  sopId: string;
  roleId: string | null;
  roleName: string | null;
  roleStatus: RoleStatus | null;
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
}

export interface UpdateSopStepRequest {
  name?: string;
  description?: string;
  sequenceNo?: number;
  roleId?: string | null;
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

import type { WorkflowHooks } from '@/services/workflowHooks';

export interface WorkflowProcess {
  /** Workflows the engine runs across every task in this process (DP-5). */
  workflowHooks: WorkflowHooks;
  crmId: string;
  name: string;
  recordEntity: string;
  recordEntityName: string | null;
  regardingField: string;
  parentEntity: string;
  parentEntityName: string | null;
  versionMajor: number;
  versionMinor: number;
  workflowState: 'draft' | 'published' | 'archived';
  snapshot: string | null;
  /** ID of the qdb_sop this process was derived from. Only set on SOP-derived processes. */
  sopId?: string | null;
}

export type AssignToType = 'user' | 'team' | 'roundRobin' | 'readFromParent';

/**
 * Who the engine gives a task to. `readFromParent` names a field on the task's
 * parent record and takes the user it points at, so ownership follows the
 * application rather than being fixed at design time.
 */
export interface AssignmentFields {
  assignTo: AssignToType;
  assignedUserId: string | null;
  assignedUserName: string | null;
  teamId: string | null;
  teamName: string | null;
  roundRobinTeamId: string | null;
  roundRobinTeamName: string | null;
  /** The parent table to read the owner from. */
  parentAssignEntityId: string | null;
  parentAssignEntityName: string | null;
  /** The lookup on the task's own record that points at the parent. */
  parentAssignFieldId: string | null;
  parentAssignFieldName: string | null;
  /** The user field on the parent record that names the owner. */
  parentAssignUserFieldId: string | null;
  parentAssignUserFieldName: string | null;
}

// --- Escalation: the platform engine's model (CWFD-005) ---

/**
 * How a step escalates when it runs late.
 *
 * These are the only two columns `QDBCatalog.CRM.TatAndEscalations` reads from a
 * step. Everything a deadline needs — the value, its unit, working-days versus
 * calendar-days, the level chain, the email template, the workflow to trigger —
 * lives on a **reusable escalation configuration record**, not on the step. The
 * step either names one, or asks for one to be resolved by condition:
 *
 *     config = step.qdb_escalation
 *           ?? (step.qdb_applyescalationfilter ? resolveByCondition(...) : null)
 *
 * DP-2 modelled this as eleven per-step scalars (duration, unit, basis, warning
 * percentage, action, target type, three target lookups). Nothing read them, and
 * they flattened a shared configuration into copies on every step.
 */
export interface EscalationFields {
  /** The escalation configuration this step follows. Null when it does not escalate. */
  escalationConfigId: string | null;
  escalationConfigName: string | null;
  /** Resolve a configuration by condition instead of naming one outright. */
  applyEscalationFilter: boolean;
}

/** An escalation configuration a step can point at. */
export interface EscalationConfigOption {
  id: string;
  name: string;
  /** Numeric escalation value with its unit, e.g. "3 Days", for the picker. */
  summary: string | null;
}

// --- Concurrency: the platform engine's model (CWFD-005) ---

/**
 * How a step participates in concurrent work.
 *
 * These are the columns the QDB process engine actually reads. A step naming a
 * `parentStepId` is a **branch**: when the parent step's task is created,
 * `OnTaskCreate` creates a task for this step too, and the two run side by side.
 * A branch may carry its own condition, so a branch can be skipped without
 * skipping its siblings.
 *
 * DP-1 originally modelled concurrency as `splitType`/`joinType` option sets.
 * Those were never read by anything — see `cwfd-005-runtime/engine-contract.md`.
 */
export interface BranchFields {
  /** The step this one runs concurrently beneath. Null for an ordinary step. */
  parentStepId: string | null;
  parentStepName: string | null;
  /** When true, this branch starts only if `branchFilter` matches the record. */
  applyBranchFilter: boolean;
  /** FetchXML deciding whether this branch runs at all. */
  branchFilter: string;
}

export interface WorkflowStep extends EscalationFields, BranchFields, AssignmentFields {
  /** Workflows the engine runs at points in this step’s task life (DP-5). */
  workflowHooks: WorkflowHooks;
  crmId: string;
  name: string;
  schemaName: string;
  sequenceNo: number;
  taskSubject: string;
  taskDescription: string;
  recordEntityId: string | null;
  recordEntityName: string | null;
  regardingFieldId: string | null;
  regardingFieldName: string | null;
  parentEntityId: string | null;
  parentEntityName: string | null;
  /**
   * Let one completion close every task named in the completing task's
   * `qdb_bulkapprovalids`. `OnTaskComplete` copies the completing task's values
   * onto each and closes it, so approvers clear a batch in one action (DP-3).
   */
  allowBulkApproval: boolean;
  processId: string;
}

export interface AutoNumberEntityOption {
  id: string;
  name: string;
  logicalName: string;
  objectTypeCode: number;
}

export interface AutoNumberFieldOption {
  id: string;
  name: string;
  entityId: string;
}

export interface WorkflowOutcome {
  /** Workflows the engine runs for the task this outcome leads to (DP-5). */
  workflowHooks: WorkflowHooks;
  crmId: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;
  nextStepId: string | null;
  /**
   * Refuse to complete this step while its concurrent branches are still open.
   * This is the engine's join: `OnTaskComplete` throws rather than waits, so the
   * user is told to finish the branches first.
   */
  checkParallelTasks: boolean;
  /**
   * Carry any still-open branches over to the next task instead of orphaning
   * them. Only meaningful alongside `checkParallelTasks` being off.
   */
  updateParallelTaskRef: boolean;
}

export type RoundRobinTeamOption = TeamOption;

export interface WorkflowRoute {
  /** Workflows the engine runs for the task this route leads to (DP-5). */
  workflowHooks: WorkflowHooks;
  crmId: string;
  name: string;
  subject: string;
  sequenceNumber: number;
  filter: string;
  outcomeId: string;
  nextStepId: string | null;
}

export interface EntityOption {
  logicalName: string;
  displayName: string;
  objectTypeCode: number;
}

export interface AttributeOption {
  schemaName: string;
  displayName: string;
  attributeType: string;
}

export interface UserOption {
  id: string;
  fullName: string;
  domainName: string;
}

export interface TeamOption {
  id: string;
  name: string;
}

export type WorkflowStateCode = 'draft' | 'published' | 'archived';

export const WORKFLOW_STATE_CODES: Record<WorkflowStateCode, number> = {
  draft: 100000000,
  published: 100000001,
  archived: 100000002,
};

// ASSIGN_TO_CODES moved to services/taskAssignment.ts with the rest of the
// assignment mapping. It used to encode round robin as the Team value plus
// qdb_enableroundrobin; the org has always had its own Apply Round Robin value,
// and sharing the Team code made a saved round-robin step read back as a Team
// step with no team.

// DP-1's qdb_splittype / qdb_jointype and DP-2's four SLA/escalation option sets
// lived here. All were removed by the CWFD-005 reconciliation: the engine reads a
// step's escalation configuration lookup and its branch hierarchy instead, and
// nothing ever read the columns those code maps described.

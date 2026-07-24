// Client-side orchestration that derives a workflow process from a published SOP.
// Replaces the qdb_CreateProcessFromSop Custom API (not registered in Dataverse).
import { ASSIGN_TO_CODES } from '@/types/WorkflowTypes';
import type { AssignToType } from '@/types/WorkflowTypes';
import type { ISopAdapter } from './ISopAdapter';
import { copySlaFields } from './slaStepFields';
import type { CreateProcessFromSopRequest, StepAssignment } from '@/types/SopTypes';

export async function deriveProcessFromSop(
  adapter: ISopAdapter,
  request: CreateProcessFromSopRequest
): Promise<string> {
  const sopSteps = await adapter.getSopSteps(request.sopId);

  // Fetch all SOP outcomes up-front (before any creates, so IDs are stable)
  const outcomeArrays = await Promise.all(
    sopSteps.map((step) => adapter.getSopOutcomes(step.id))
  );
  const allSopOutcomes = outcomeArrays.flat();

  // Create the process, linking it back to the source SOP via qdb_sop_id
  const processId = await adapter.createProcess({
    name: request.processName,
    recordEntity: request.taskEntity,
    recordEntityName: null,
    regardingField: request.regardingField,
    parentEntity: request.parentEntity,
    parentEntityName: null,
    versionMajor: 1,
    versionMinor: 0,
    workflowState: 'draft',
    snapshot: null,
    sopId: request.sopId,
  });

  // Create workflow steps and build a SOP-step-ID → workflow-step-ID map
  const stepIdMap: Record<string, string> = {};

  for (const sopStep of sopSteps) {
    const assignment = request.stepAssignments.find((a) => a.sopStepId === sopStep.id);

    const workflowStepId = await adapter.createStep({
      // Inherit the SOP step's SLA/escalation config onto the derived process step
      // (a one-time snapshot; independently editable afterward).
      ...copySlaFields(sopStep),
      name: sopStep.name,
      schemaName: '',
      sequenceNo: sopStep.sequenceNo,
      taskSubject: assignment?.taskSubject || sopStep.name,
      taskDescription: sopStep.description,
      processId,
      assignTo: resolveAssignTo(assignment),
      assignedUserId: assignment?.assignedUserId ?? null,
      assignedUserName: null,
      teamId: assignment?.teamId ?? null,
      teamName: null,
      roundRobinTeamId: assignment?.roundRobinTeamId ?? null,
      roundRobinTeamName: null,
      recordEntityId: request.taskEntity || null,
      recordEntityName: null,
      regardingFieldId: request.regardingField || null,
      regardingFieldName: null,
      parentEntityId: request.parentEntity || null,
      parentEntityName: null,
    });

    stepIdMap[sopStep.id] = workflowStepId;
  }

  // Create workflow outcomes and routes.
  // The canvas draws edges from qdb_outcomeworktasks (routes), NOT from
  // qdb_outcome.qdb_nextworkitemstep directly. So we must create both:
  //   qdb_outcome — the labelled option on a step (e.g. "Approved")
  //   qdb_outcomeworktasks — the connection that points to the next step
  for (const sopOutcome of allSopOutcomes) {
    const workflowStepId = stepIdMap[sopOutcome.sopStepId];
    if (!workflowStepId) continue;

    const nextWorkflowStepId = sopOutcome.nextSopStepId
      ? (stepIdMap[sopOutcome.nextSopStepId] ?? null)
      : null;

    const outcomeId = await adapter.createOutcome({
      name: sopOutcome.name,
      sequenceNumber: sopOutcome.sequenceNo,
      applyFilter: false,
      stepId: workflowStepId,
      nextStepId: nextWorkflowStepId,
    });

    // Only create a route when there is a next step — terminal outcomes have no arrow
    if (nextWorkflowStepId) {
      await adapter.createRoute({
        name: sopOutcome.name,
        subject: sopOutcome.name,
        sequenceNumber: sopOutcome.sequenceNo,
        filter: '',
        outcomeId,
        nextStepId: nextWorkflowStepId,
      });
    }
  }

  return processId;
}

function resolveAssignTo(assignment: StepAssignment | undefined): AssignToType {
  if (!assignment || assignment.assignToType === null) return 'user';
  if (assignment.assignToType === ASSIGN_TO_CODES.user) return 'user';
  // Both team and roundRobin share code 100000002; enableRoundRobin is the discriminant.
  return assignment.enableRoundRobin ? 'roundRobin' : 'team';
}

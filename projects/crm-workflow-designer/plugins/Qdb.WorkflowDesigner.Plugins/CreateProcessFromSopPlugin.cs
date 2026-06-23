// CreateProcessFromSopPlugin.cs
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Qdb.WorkflowDesigner.Plugins.Models;

namespace Qdb.WorkflowDesigner.Plugins
{
    /// <summary>
    /// Handles the qdb_CreateProcessFromSop Custom API message.
    /// Registered: Post-operation, Synchronous — participates in platform transaction.
    /// Creates qdb_work_item_record_type, qdb_work_item_steps, and qdb_outcome records
    /// derived from a published qdb_sop.
    /// </summary>
    public sealed class CreateProcessFromSopPlugin : IPlugin
    {
        private const int SOP_STATUS_PUBLISHED = 100000001;
        private const string ENTITY_SOP = "qdb_sop";
        private const string ENTITY_PROCESS = "qdb_work_item_record_type";
        private const string ENTITY_STEP = "qdb_work_item_steps";
        private const string ENTITY_OUTCOME = "qdb_outcome";
        private const string ENTITY_SOP_STEP = "qdb_sopstep";
        private const string ENTITY_SOP_OUTCOME = "qdb_sopoutcome";

        private static readonly JsonSerializerSettings CamelCaseSettings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
        };

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = serviceFactory.CreateOrganizationService(context.UserId);

            var parameters = ExtractAndValidateParameters(context.InputParameters);
            var stepAssignments = DeserialiseStepAssignments(parameters.StepAssignmentsJson);

            ValidateSopIsPublished(service, parameters.SopId);

            var processId = CreateProcess(service, parameters);
            var sopSteps = LoadSopSteps(service, parameters.SopId);

            var sopStepToWorkitemStep = CreateWorkitemSteps(
                service, sopSteps, processId, parameters, stepAssignments);

            CreateWorkitemOutcomes(service, sopSteps, sopStepToWorkitemStep);

            context.OutputParameters["ProcessId"] =
                new EntityReference(ENTITY_PROCESS, processId);
        }

        private static PluginParameters ExtractAndValidateParameters(
            ParameterCollection inputParameters)
        {
            var sopRef = inputParameters.Contains("SopId")
                ? (EntityReference)inputParameters["SopId"]
                : throw new InvalidPluginExecutionException("SopId parameter is required.");

            var processName = inputParameters.Contains("ProcessName")
                ? (string)inputParameters["ProcessName"]
                : throw new InvalidPluginExecutionException("ProcessName parameter is required.");

            if (string.IsNullOrWhiteSpace(processName))
                throw new InvalidPluginExecutionException("ProcessName cannot be empty.");

            var taskEntity = inputParameters.Contains("TaskEntity")
                ? (string)inputParameters["TaskEntity"]
                : throw new InvalidPluginExecutionException("TaskEntity parameter is required.");

            if (string.IsNullOrWhiteSpace(taskEntity))
                throw new InvalidPluginExecutionException("TaskEntity cannot be empty.");

            var stepAssignmentsJson = inputParameters.Contains("StepAssignments")
                ? (string)inputParameters["StepAssignments"]
                : throw new InvalidPluginExecutionException("StepAssignments parameter is required.");

            return new PluginParameters
            {
                SopId = sopRef.Id,
                ProcessName = processName.Trim(),
                ProcessDescription = inputParameters.Contains("ProcessDescription")
                    ? (string?)inputParameters["ProcessDescription"] ?? string.Empty
                    : string.Empty,
                TaskEntity = taskEntity.Trim(),
                RegardingField = inputParameters.Contains("RegardingField")
                    ? (string?)inputParameters["RegardingField"] ?? string.Empty
                    : string.Empty,
                ParentEntity = inputParameters.Contains("ParentEntity")
                    ? (string?)inputParameters["ParentEntity"] ?? string.Empty
                    : string.Empty,
                StepAssignmentsJson = stepAssignmentsJson,
            };
        }

        private static List<StepAssignment> DeserialiseStepAssignments(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                throw new InvalidPluginExecutionException("StepAssignments cannot be empty.");

            try
            {
                var assignments = JsonConvert.DeserializeObject<List<StepAssignment>>(json, CamelCaseSettings)
                    ?? throw new InvalidPluginExecutionException(
                        "StepAssignments JSON deserialised to null.");

                foreach (var assignment in assignments)
                {
                    if (!Guid.TryParse(assignment.SopStepId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid sopStepId: {assignment.SopStepId}");

                    if (assignment.AssignedUserId != null &&
                        !Guid.TryParse(assignment.AssignedUserId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid assignedUserId: {assignment.AssignedUserId}");

                    if (assignment.TeamId != null &&
                        !Guid.TryParse(assignment.TeamId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid teamId: {assignment.TeamId}");
                }

                return assignments;
            }
            catch (JsonException ex)
            {
                throw new InvalidPluginExecutionException(
                    $"StepAssignments parameter contains invalid JSON: {ex.Message}");
            }
        }

        private static void ValidateSopIsPublished(IOrganizationService service, Guid sopId)
        {
            var sop = service.Retrieve(ENTITY_SOP, sopId, new ColumnSet("qdb_status"));
            var status = sop.GetAttributeValue<OptionSetValue>("qdb_status")?.Value;

            if (status != SOP_STATUS_PUBLISHED)
                throw new InvalidPluginExecutionException(
                    "The referenced SOP is not in Published status. Only Published SOPs can be used to derive processes.");
        }

        private static Guid CreateProcess(
            IOrganizationService service,
            PluginParameters parameters)
        {
            var process = new Entity(ENTITY_PROCESS);
            process["qdb_name"] = parameters.ProcessName;

            if (!string.IsNullOrEmpty(parameters.ProcessDescription))
                process["qdb_description"] = parameters.ProcessDescription;

            if (!string.IsNullOrEmpty(parameters.TaskEntity))
                process["qdb_recordentity"] = parameters.TaskEntity;

            if (!string.IsNullOrEmpty(parameters.RegardingField))
                process["qdb_regardingfield"] = parameters.RegardingField;

            if (!string.IsNullOrEmpty(parameters.ParentEntity))
                process["qdb_parententity"] = parameters.ParentEntity;

            process["qdb_sop_id"] = new EntityReference(ENTITY_SOP, parameters.SopId);

            return service.Create(process);
        }

        private static EntityCollection LoadSopSteps(
            IOrganizationService service,
            Guid sopId)
        {
            var query = new QueryExpression(ENTITY_SOP_STEP)
            {
                ColumnSet = new ColumnSet("qdb_sopstepid", "qdb_name", "qdb_sequenceno"),
                Orders = { new OrderExpression("qdb_sequenceno", OrderType.Ascending) },
            };
            query.Criteria.AddCondition("qdb_sop_id", ConditionOperator.Equal, sopId);
            return service.RetrieveMultiple(query);
        }

        private static Dictionary<Guid, Guid> CreateWorkitemSteps(
            IOrganizationService service,
            EntityCollection sopSteps,
            Guid processId,
            PluginParameters parameters,
            List<StepAssignment> stepAssignments)
        {
            var sopStepToWorkitemStep = new Dictionary<Guid, Guid>();
            var assignmentLookup = BuildAssignmentLookup(stepAssignments);

            foreach (var sopStep in sopSteps.Entities)
            {
                var sopStepId = sopStep.Id;
                assignmentLookup.TryGetValue(sopStepId, out var assignment);

                var workitemStep = new Entity(ENTITY_STEP);
                workitemStep["qdb_record_type"] =
                    new EntityReference(ENTITY_PROCESS, processId);
                workitemStep["qdb_name"] = sopStep["qdb_name"];
                workitemStep["qdb_sequenceno"] = sopStep["qdb_sequenceno"];
                workitemStep["qdb_tasksubject"] =
                    assignment != null && !string.IsNullOrEmpty(assignment.TaskSubject)
                        ? assignment.TaskSubject
                        : (string)sopStep["qdb_name"];

                if (!string.IsNullOrEmpty(parameters.TaskEntity))
                    workitemStep["qdb_recordentity"] = parameters.TaskEntity;

                if (!string.IsNullOrEmpty(parameters.RegardingField))
                    workitemStep["qdb_regardingfield"] = parameters.RegardingField;

                if (!string.IsNullOrEmpty(parameters.ParentEntity))
                    workitemStep["qdb_parententity"] = parameters.ParentEntity;

                ApplyAssignment(workitemStep, assignment);

                var workitemStepId = service.Create(workitemStep);
                sopStepToWorkitemStep[sopStepId] = workitemStepId;
            }

            return sopStepToWorkitemStep;
        }

        private static Dictionary<Guid, StepAssignment> BuildAssignmentLookup(
            List<StepAssignment> assignments)
        {
            var lookup = new Dictionary<Guid, StepAssignment>();
            foreach (var assignment in assignments)
            {
                if (Guid.TryParse(assignment.SopStepId, out var guid))
                    lookup[guid] = assignment;
            }
            return lookup;
        }

        private static void ApplyAssignment(Entity step, StepAssignment? assignment)
        {
            if (assignment?.AssignToType == null) return;

            step["qdb_task_assign_to"] = new OptionSetValue(assignment.AssignToType.Value);

            if (assignment.AssignToType == 100000000 &&
                Guid.TryParse(assignment.AssignedUserId, out var userId))
            {
                step["qdb_assigned_user"] = new EntityReference("systemuser", userId);
            }
            else if (assignment.AssignToType == 100000002 &&
                Guid.TryParse(assignment.TeamId, out var teamId))
            {
                step["qdb_team"] = new EntityReference("team", teamId);
                step["qdb_enableroundrobin"] = assignment.EnableRoundRobin;

                if (assignment.EnableRoundRobin &&
                    Guid.TryParse(assignment.RoundRobinTeamId, out var rrTeamId))
                {
                    step["qdb_roundrobinteam"] = new EntityReference("qdb_roundrobinteam", rrTeamId);
                }
            }
        }

        private static void CreateWorkitemOutcomes(
            IOrganizationService service,
            EntityCollection sopSteps,
            Dictionary<Guid, Guid> sopStepToWorkitemStep)
        {
            foreach (var sopStep in sopSteps.Entities)
            {
                var sopOutcomes = LoadSopOutcomesForStep(service, sopStep.Id);

                foreach (var sopOutcome in sopOutcomes.Entities)
                {
                    var outcome = new Entity(ENTITY_OUTCOME);
                    outcome["qdb_workitemstep"] = new EntityReference(
                        ENTITY_STEP,
                        sopStepToWorkitemStep[sopStep.Id]);
                    outcome["qdb_name"] = sopOutcome["qdb_name"];
                    outcome["qdb_sequencenumber"] = sopOutcome["qdb_sequenceno"];

                    var nextSopStepRef = sopOutcome.GetAttributeValue<EntityReference>(
                        "qdb_nextsopstep_id");

                    if (nextSopStepRef != null &&
                        sopStepToWorkitemStep.TryGetValue(nextSopStepRef.Id, out var nextWorkitemStepId))
                    {
                        outcome["qdb_nextworkitemstep"] = new EntityReference(
                            ENTITY_STEP, nextWorkitemStepId);
                    }

                    service.Create(outcome);
                }
            }
        }

        private static EntityCollection LoadSopOutcomesForStep(
            IOrganizationService service,
            Guid sopStepId)
        {
            var query = new QueryExpression(ENTITY_SOP_OUTCOME)
            {
                ColumnSet = new ColumnSet(
                    "qdb_sopoutcomeid",
                    "qdb_name",
                    "qdb_sequenceno",
                    "qdb_nextsopstep_id"),
                Orders = { new OrderExpression("qdb_sequenceno", OrderType.Ascending) },
            };
            query.Criteria.AddCondition(
                "qdb_sopstep_id", ConditionOperator.Equal, sopStepId);
            return service.RetrieveMultiple(query);
        }

        private sealed class PluginParameters
        {
            public Guid SopId { get; set; }
            public string ProcessName { get; set; } = string.Empty;
            public string ProcessDescription { get; set; } = string.Empty;
            public string TaskEntity { get; set; } = string.Empty;
            public string RegardingField { get; set; } = string.Empty;
            public string ParentEntity { get; set; } = string.Empty;
            public string StepAssignmentsJson { get; set; } = string.Empty;
        }
    }
}

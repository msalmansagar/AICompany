using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads and saves qdb_survey_source activation state and its triggers' codes.</summary>
    public sealed class ActivationSourceStore : IActivationSourceStore
    {
        private readonly IOrganizationService _service;

        public ActivationSourceStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public ActivationSource Find(Guid sourceId)
        {
            var query = new QueryExpression("qdb_survey_source")
            {
                ColumnSet = new ColumnSet("qdb_name", "qdb_table_logical_name", "qdb_status_field", "qdb_type_field", "qdb_step_registration_json"),
                TopCount = 1,
            };
            query.Criteria.AddCondition("qdb_survey_sourceid", ConditionOperator.Equal, sourceId);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : new ActivationSource
            {
                Id = row.Id,
                Name = row.GetAttributeValue<string>("qdb_name"),
                TableLogicalName = row.GetAttributeValue<string>("qdb_table_logical_name"),
                StatusField = row.GetAttributeValue<string>("qdb_status_field") ?? "statuscode",
                TypeField = row.GetAttributeValue<string>("qdb_type_field"),
                Registrations = StepRegistration.FromJson(row.GetAttributeValue<string>("qdb_step_registration_json")),
            };
        }

        /// <inheritdoc />
        public void SaveActivation(Guid sourceId, bool isActive, IReadOnlyList<StepRegistration> registrations)
        {
            _service.Update(new Entity("qdb_survey_source", sourceId)
            {
                ["qdb_is_active"] = isActive,
                ["qdb_step_registration_json"] = registrations.Count == 0 ? null : StepRegistration.ToJson(registrations),
            });
        }

        /// <inheritdoc />
        public IReadOnlyList<TriggerCodes> GetTriggerCodes(Guid sourceId)
        {
            var query = new QueryExpression("qdb_survey_trigger")
            {
                ColumnSet = new ColumnSet("qdb_name", "qdb_trigger_kind", "qdb_status_values", "qdb_type_values", "qdb_milestone_status_values", "qdb_milestone_type_values"),
            };
            query.Criteria.AddCondition("qdb_source_id", ConditionOperator.Equal, sourceId);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            return _service.RetrieveMultiple(query).Entities.Select(MapTriggerCodes).ToList();
        }

        // A milestone trigger counts with its own status and type sets.
        private static TriggerCodes MapTriggerCodes(Entity row)
        {
            var isMilestone = row.GetAttributeValue<OptionSetValue>("qdb_trigger_kind")?.Value == (int)TriggerKind.Milestone;
            return new TriggerCodes
            {
                TriggerName = row.GetAttributeValue<string>("qdb_name") ?? row.Id.ToString("D"),
                StatusCodes = CodeList.Parse(row.GetAttributeValue<string>(isMilestone ? "qdb_milestone_status_values" : "qdb_status_values")).ToArray(),
                TypeCodes = CodeList.Parse(row.GetAttributeValue<string>(isMilestone ? "qdb_milestone_type_values" : "qdb_type_values")).ToArray(),
            };
        }
    }
}

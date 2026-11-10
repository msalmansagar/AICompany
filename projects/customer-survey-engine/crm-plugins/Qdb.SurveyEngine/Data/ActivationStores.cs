using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
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

    /// <summary>
    /// Checks the System Administrator role by its platform role template, which is the same in
    /// every org and language, through the user's own roles or a team's.
    /// </summary>
    public sealed class AdministratorCheck : IAdministratorCheck
    {
        /// <summary>The platform's fixed role template id of System Administrator.</summary>
        public static readonly Guid SystemAdministratorTemplateId = new Guid("627090FF-40A3-4053-8790-584EDC5BE201");
        private readonly IOrganizationService _service;

        public AdministratorCheck(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public bool IsSystemAdministrator(Guid userId) => HasDirectRole(userId) || HasTeamRole(userId);

        private bool HasDirectRole(Guid userId)
        {
            var query = AdministratorRoleQuery();
            var userRoles = query.AddLink("systemuserroles", "roleid", "roleid");
            userRoles.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        private bool HasTeamRole(Guid userId)
        {
            var query = AdministratorRoleQuery();
            var membership = query.AddLink("teamroles", "roleid", "roleid").AddLink("teammembership", "teamid", "teamid");
            membership.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        private static QueryExpression AdministratorRoleQuery()
        {
            var query = new QueryExpression("role") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("roletemplateid", ConditionOperator.Equal, SystemAdministratorTemplateId);
            return query;
        }
    }

    /// <summary>Reads choice, status and Yes/No codes from attribute metadata.</summary>
    public sealed class OptionCodeReader : IOptionCodeReader
    {
        private readonly IOrganizationService _service;

        public OptionCodeReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyCollection<string> ReadCodes(string table, string column)
        {
            var response = (RetrieveAttributeResponse)_service.Execute(new RetrieveAttributeRequest { EntityLogicalName = table, LogicalName = column });
            if (response.AttributeMetadata is EnumAttributeMetadata choice)
                return choice.OptionSet.Options.Where(o => o.Value.HasValue).Select(o => o.Value.Value.ToString()).ToList();
            return response.AttributeMetadata is BooleanAttributeMetadata ? new[] { "true", "false" } : null;
        }
    }
}

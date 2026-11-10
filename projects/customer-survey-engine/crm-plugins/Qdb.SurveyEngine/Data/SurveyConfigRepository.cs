using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads qdb_survey_source, record-driven qdb_survey_trigger rows (+ setup) and qdb_survey_settings.</summary>
    public sealed class SurveyConfigRepository : ISurveyConfigRepository
    {
        private readonly IOrganizationService _service;

        public SurveyConfigRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public SurveySource FindActiveSource(string tableLogicalName)
        {
            var query = new QueryExpression("qdb_survey_source") { ColumnSet = new ColumnSet(SurveyConfigMapping.SourceColumns), TopCount = 1 };
            query.Criteria.AddCondition("qdb_table_logical_name", ConditionOperator.Equal, tableLogicalName);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : SurveyConfigMapping.MapSource(row);
        }

        /// <inheritdoc />
        public IReadOnlyList<SurveyTrigger> GetActiveRecordTriggers(Guid sourceId)
        {
            var query = new QueryExpression("qdb_survey_trigger")
            {
                ColumnSet = new ColumnSet("qdb_trigger_kind", "qdb_status_values", "qdb_type_values", "qdb_priority", "qdb_fatigue_action", "createdon",
                    "qdb_milestone_every_n", "qdb_milestone_type_values", "qdb_milestone_status_values", "qdb_milestone_count_from", "qdb_milestone_skip_reached"),
            };
            query.Criteria.AddCondition("qdb_source_id", ConditionOperator.Equal, sourceId);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_trigger_kind", ConditionOperator.In, (int)TriggerKind.Event, (int)TriggerKind.Created, (int)TriggerKind.Milestone);
            query.LinkEntities.Add(SurveyConfigMapping.BuildActiveSetupLink());
            return _service.RetrieveMultiple(query).Entities.Select(SurveyConfigMapping.MapTrigger).ToList();
        }

        /// <inheritdoc />
        public SurveySettings GetSettings()
        {
            var query = new QueryExpression("qdb_survey_settings")
            {
                ColumnSet = new ColumnSet("qdb_language_field", "qdb_default_language", "qdb_fatigue_min_days", "qdb_retention_days", "qdb_retention_mode"),
                TopCount = 1,
            };
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            var settings = new SurveySettings();
            if (row == null) return settings;
            settings.LanguageField = row.GetAttributeValue<string>("qdb_language_field");
            settings.DefaultLanguage = row.GetAttributeValue<string>("qdb_default_language") ?? settings.DefaultLanguage;
            settings.FatigueMinDays = row.GetAttributeValue<int?>("qdb_fatigue_min_days") ?? settings.FatigueMinDays;
            settings.RetentionDays = row.GetAttributeValue<int?>("qdb_retention_days");
            settings.RetentionMode = (RetentionMode?)row.GetAttributeValue<OptionSetValue>("qdb_retention_mode")?.Value;
            return settings;
        }
    }
}

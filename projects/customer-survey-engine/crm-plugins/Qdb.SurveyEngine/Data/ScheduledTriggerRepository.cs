using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads active scheduled triggers with their active setup and optional population source.</summary>
    public sealed class ScheduledTriggerRepository : IScheduledTriggerRepository
    {
        private const string PopulationAlias = "population";
        private readonly IOrganizationService _service;

        public ScheduledTriggerRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyList<SurveyTrigger> GetActiveScheduledTriggers()
        {
            var query = new QueryExpression("qdb_survey_trigger")
            {
                ColumnSet = new ColumnSet("qdb_trigger_kind", "qdb_status_values", "qdb_type_values", "qdb_priority", "qdb_fatigue_action", "createdon",
                    "qdb_schedule_period", "qdb_schedule_population"),
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_trigger_kind", ConditionOperator.Equal, (int)TriggerKind.Scheduled);
            query.Criteria.AddCondition("qdb_schedule_period", ConditionOperator.NotNull);
            query.LinkEntities.Add(SurveyConfigMapping.BuildActiveSetupLink());
            query.LinkEntities.Add(BuildPopulationSourceLink());
            return _service.RetrieveMultiple(query).Entities.Select(MapScheduledTrigger).ToList();
        }

        private static LinkEntity BuildPopulationSourceLink() =>
            new LinkEntity("qdb_survey_trigger", "qdb_survey_source", "qdb_schedule_population_source_id", "qdb_survey_sourceid", JoinOperator.LeftOuter)
            {
                EntityAlias = PopulationAlias,
                Columns = new ColumnSet(SurveyConfigMapping.SourceColumns.Concat(new[] { "qdb_survey_sourceid" }).ToArray()),
            };

        private static SurveyTrigger MapScheduledTrigger(Entity row)
        {
            var trigger = SurveyConfigMapping.MapTrigger(row);
            trigger.Schedule = new ScheduleSettings
            {
                Period = (SchedulePeriod)row.GetAttributeValue<OptionSetValue>("qdb_schedule_period").Value,
                Population = (SchedulePopulation?)row.GetAttributeValue<OptionSetValue>("qdb_schedule_population")?.Value ?? SchedulePopulation.AllActiveCustomers,
                PopulationSource = MapPopulationSource(row),
            };
            return trigger;
        }

        // The left-outer link answers no source id when the trigger has no population source.
        private static SurveySource MapPopulationSource(Entity row)
        {
            var id = row.GetAttributeValue<AliasedValue>(PopulationAlias + ".qdb_survey_sourceid")?.Value;
            if (id == null) return null;
            var aliased = new Entity("qdb_survey_source", (Guid)id);
            foreach (var column in SurveyConfigMapping.SourceColumns) aliased[column] = row.GetAttributeValue<AliasedValue>(PopulationAlias + "." + column)?.Value;
            return SurveyConfigMapping.MapSource(aliased);
        }
    }
}

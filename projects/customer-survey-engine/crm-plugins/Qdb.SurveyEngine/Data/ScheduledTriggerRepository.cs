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

        // The run record (ADR-011) and the row version every run write is conditional on.
        private static readonly string[] RunColumns =
        {
            "qdb_run_status", "qdb_run_period_key", "qdb_run_cursor", "qdb_run_evaluated_count", "qdb_invited_count", "qdb_postponed_count",
            "qdb_suppressed_count", "qdb_run_failed_calls", "qdb_run_started_on", "qdb_run_progress_on", "qdb_run_message", "versionnumber",
        };
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
                ColumnSet = new ColumnSet(new[] { "qdb_trigger_kind", "qdb_status_values", "qdb_type_values", "qdb_priority", "qdb_fatigue_action", "createdon",
                    "qdb_schedule_period", "qdb_schedule_population" }.Concat(RunColumns).ToArray()),
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
                Run = MapRun(row),
            };
            return trigger;
        }

        private static ScheduledRunState MapRun(Entity row) => new ScheduledRunState
        {
            Status = (ScheduledRunStatus?)row.GetAttributeValue<OptionSetValue>("qdb_run_status")?.Value ?? ScheduledRunStatus.NotSent,
            PeriodKey = row.GetAttributeValue<string>("qdb_run_period_key"),
            LastCustomerId = ParseCustomerId(row.GetAttributeValue<string>("qdb_run_cursor")),
            Evaluated = row.GetAttributeValue<int?>("qdb_run_evaluated_count") ?? 0,
            Invited = row.GetAttributeValue<int?>("qdb_invited_count") ?? 0,
            Postponed = row.GetAttributeValue<int?>("qdb_postponed_count") ?? 0,
            Suppressed = row.GetAttributeValue<int?>("qdb_suppressed_count") ?? 0,
            FailedCalls = row.GetAttributeValue<int?>("qdb_run_failed_calls") ?? 0,
            StartedOn = row.GetAttributeValue<DateTime?>("qdb_run_started_on"),
            ProgressOn = row.GetAttributeValue<DateTime?>("qdb_run_progress_on"),
            Message = row.GetAttributeValue<string>("qdb_run_message"),
            RowVersion = row.RowVersion,
        };

        // A cursor that is not a customer id (e.g. a One-time cursor left by an earlier kind) restarts the population.
        private static Guid? ParseCustomerId(string cursor)
        {
            Guid customerId;
            return Guid.TryParse(cursor, out customerId) ? customerId : (Guid?)null;
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

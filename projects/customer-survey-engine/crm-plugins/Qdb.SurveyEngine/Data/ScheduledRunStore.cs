using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Writes a scheduled trigger's run record on qdb_survey_trigger (data-model.md, Scheduled run progress).
    /// Every write is conditional on the row version, as for One-time runs (<see cref="OneTimeTriggerStore"/>).
    /// </summary>
    public sealed class ScheduledRunStore : IScheduledRunStore
    {
        private const int RowVersionMismatchError = unchecked((int)0x80060882);
        private readonly IOrganizationService _service;

        public ScheduledRunStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public RunWrite TrySave(Guid triggerId, ScheduledRunState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            var change = RunRecord(triggerId, state);
            change.RowVersion = state.RowVersion;
            try
            {
                _service.Execute(new UpdateRequest { Target = change, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
            }
            catch (FaultException<OrganizationServiceFault> fault) when (fault.Detail.ErrorCode == RowVersionMismatchError)
            {
                return RunWrite.Lost();
            }
            return RunWrite.Saved(_service.Retrieve(change.LogicalName, triggerId, new ColumnSet("versionnumber")).RowVersion);
        }

        private static Entity RunRecord(Guid triggerId, ScheduledRunState state) => new Entity("qdb_survey_trigger", triggerId)
        {
            ["qdb_run_status"] = new OptionSetValue((int)state.Status),
            ["qdb_run_period_key"] = state.PeriodKey,
            ["qdb_run_cursor"] = state.LastCustomerId?.ToString("D"),
            ["qdb_run_evaluated_count"] = state.Evaluated,
            ["qdb_invited_count"] = state.Invited,
            ["qdb_postponed_count"] = state.Postponed,
            ["qdb_suppressed_count"] = state.Suppressed,
            ["qdb_run_failed_calls"] = state.FailedCalls,
            ["qdb_run_started_on"] = state.StartedOn,
            ["qdb_run_progress_on"] = state.ProgressOn,
            ["qdb_run_message"] = Cut(state.Message),
        };

        private static string Cut(string message) =>
            message == null || message.Length <= ScheduledRunState.MessageMaxLength ? message : message.Substring(0, ScheduledRunState.MessageMaxLength);
    }
}

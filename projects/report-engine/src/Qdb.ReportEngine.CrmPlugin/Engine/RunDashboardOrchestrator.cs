using System;
using System.Diagnostics;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Model;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// A dashboard run, with nothing about how it was invoked.
    ///
    /// The cloud reaches this through the <c>qdb_RunDashboard</c> Custom API and its plugin;
    /// on-premise reaches it through <see cref="Workflows.RunDashboardActivity"/> inside a Process
    /// Action. Neither owns the behaviour, so neither can drift from the other.
    /// </summary>
    internal static class RunDashboardOrchestrator
    {
        public static RunReportOutcome Execute(
            Guid dashboardId,
            Guid callerId,
            ITracingService tracing,
            IOrganizationService asUser,
            IOrganizationService asSystem)
        {
            var log = new ExecutionLogWriter(asSystem, tracing);
            var entry = new ExecutionLogEntry
            {
                ReportName = dashboardId.ToString(),
                UserId = callerId,
                CorrelationId = Guid.NewGuid().ToString("N"),
                StartedOn = DateTime.UtcNow
            };
            var clock = Stopwatch.StartNew();

            DashboardResult result = null;
            ReportFailureInfo failure = null;

            try
            {
                // As in a report run, each assignment marks the stage now in progress so a failure is
                // logged where it happened: a broken layout fails in LoadMetadata, a widget whose
                // query is refused fails in DataFetch.
                entry.Stage = ExecutionStage.LoadMetadata;
                var engine = new SdkDashboardEngine(asUser);
                var definition = engine.LoadDefinition(dashboardId);
                entry.ReportName = "Dashboard — " + definition.Title;
                entry.Stage = ExecutionStage.DataFetch;
                result = engine.Execute(definition);
                entry.RowCount = CountPoints(result);
                entry.Succeeded = true;
                entry.Stage = ExecutionStage.Complete;
            }
            catch (Exception error)
            {
                failure = ReportFailure.Classify(error);
                entry.ErrorCode = failure.Code;
                entry.ErrorDetail = FailureDetail.Describe(error);
                tracing.Trace("qdb_RunDashboard failed ({0}): {1}", failure.Code, error);
            }

            // Written before the caller is given anything: no data without a trail.
            entry.DurationMs = (int)clock.ElapsedMilliseconds;
            log.Write(entry);

            return failure == null
                ? RunReportOutcome.Success(DashboardResultJson.Write(result), entry.CorrelationId)
                : RunReportOutcome.Failed(failure.Code, failure.Message, entry.CorrelationId);
        }

        /// <summary>Total data points across every widget — the closest thing to "rows" a dashboard has.</summary>
        private static int CountPoints(DashboardResult result)
        {
            var total = 0;
            foreach (var widget in result.Widgets) total += widget.Data.Count;
            return total;
        }
    }
}

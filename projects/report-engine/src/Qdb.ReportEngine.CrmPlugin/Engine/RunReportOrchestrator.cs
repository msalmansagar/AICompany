using System;
using System.Diagnostics;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Model;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Everything a report run does, with nothing about how it was invoked.
    ///
    /// Dataverse cloud reaches this through a Custom API, and the plugin registered on it. Dynamics
    /// on-premise 9.1 has no Custom API, so it reaches the same code through a Custom Workflow
    /// Activity dropped into a Process Action. Both callers read their own arguments, build a
    /// <see cref="RunReportRequest"/>, and hand it here — so the audit rules, the access check and
    /// the drilldown behaviour cannot differ between the two platforms, which is the failure this
    /// separation exists to prevent.
    /// </summary>
    internal static class RunReportOrchestrator
    {
        /// <summary>Runs the report and returns what the caller should hand back, success or not.</summary>
        public static RunReportOutcome Execute(
            RunReportRequest request,
            ITracingService tracing,
            IOrganizationService asUser,
            ExecutionLogWriter log,
            ReportAccessGuard guard)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var entry = NewLogEntry(request.ReportId, request.CallerId);
            var clock = Stopwatch.StartNew();

            ReportResult result = null;
            ReportFailureInfo failure = null;

            try
            {
                // Each assignment marks the stage now in progress, so if the next call throws the log
                // records where it broke rather than only that it did.
                entry.Stage = ExecutionStage.Validate;
                // Checked before the definition is even loaded, and inside the try so a refusal is
                // still written to the audit log — a denied attempt is exactly what an auditor asks
                // about, and it must not be the one execution that leaves no trace.
                guard.DemandExecute(request.ReportId, request.CallerId);
                result = ExecuteReport(asUser, request, entry);
                entry.RowCount = result.RowCount;
                entry.Succeeded = true;
                entry.Stage = ExecutionStage.Complete;
            }
            catch (Exception error)
            {
                failure = ReportFailure.Classify(error);
                entry.ErrorCode = failure.Code;
                // The reason goes into the audit row as well as the trace log: the trace is off by
                // default and rolls over, so it cannot be the only place a failure is explained.
                entry.ErrorDetail = FailureDetail.Describe(error);
                // The full exception goes to the trace log for support; the caller gets the safe text.
                tracing.Trace("qdb_RunReport failed ({0}): {1}", failure.Code, error);
            }

            // The audit record is written BEFORE the caller is given anything, and a failure to write
            // it throws — so there is no path that returns report data without a recorded execution.
            entry.DurationMs = (int)clock.ElapsedMilliseconds;
            log.Write(entry);

            return failure == null
                ? RunReportOutcome.Success(ReportResultJson.Write(result), entry.CorrelationId)
                : RunReportOutcome.Failed(failure.Code, failure.Message, entry.CorrelationId);
        }

        private static ReportResult ExecuteReport(
            IOrganizationService asUser, RunReportRequest request, ExecutionLogEntry entry)
        {
            var engine = new SdkReportEngine(asUser);
            entry.Stage = ExecutionStage.LoadMetadata;
            var definition = engine.LoadDefinition(request.ReportId);
            // The report is known to exist now, so the audit row can safely reference it.
            entry.ReportId = request.ReportId;
            entry.ReportName = definition.Name;
            entry.Stage = ExecutionStage.DataFetch;

            // A drilldown is a distinct execution over related rows, so it is logged as its own entry
            // rather than folded into the parent's — "who saw which child records" is the question the
            // audit trail has to answer.
            if (request.IsDrilldown)
            {
                entry.ReportName = definition.Name + " — drilldown";
                return engine.ExecuteDrilldown(definition, request.RelationshipId, request.ParentKey);
            }

            return engine.Execute(definition, new ReportExecutionRequest
            {
                ParameterValues = ReportParameters.Parse(request.ParametersJson)
            });
        }

        /* ReportId is deliberately left unset: the audit row is linked to the report only once the
           definition has loaded. An id that does not exist cannot be bound as a lookup — Dataverse
           rejects the record, and a plugin cannot recover by retrying because the transaction is
           already doomed. The requested id travels separately so the trail still names it. */
        private static ExecutionLogEntry NewLogEntry(Guid reportId, Guid userId) => new ExecutionLogEntry
        {
            RequestedReportId = reportId,
            ReportName = reportId.ToString(),
            UserId = userId,
            CorrelationId = Guid.NewGuid().ToString("N"),
            StartedOn = DateTime.UtcNow
        };
    }
}

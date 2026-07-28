using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Writes the <c>qdb_reportexecutionlog</c> record that satisfies B4 — who ran which report,
    /// over how many rows, when, and whether it succeeded.
    ///
    /// Written with the <em>system</em> identity, not the caller's, for two reasons: the acting user
    /// need not hold create privilege on the audit table, and more importantly they cannot suppress,
    /// alter or delete their own trail. Combined with the plugin being the only route to report data
    /// (ADR-RPT-011), that makes the record unavoidable rather than best-effort.
    /// </summary>
    internal sealed class ExecutionLogWriter
    {
        private const string LogEntity = "qdb_reportexecutionlog";
        private const int NameMaxLength = 100;

        private readonly IOrganizationService _asSystem;
        private readonly ITracingService _tracing;

        public ExecutionLogWriter(IOrganizationService asSystem, ITracingService tracing)
        {
            _asSystem = asSystem;
            _tracing = tracing;
        }

        /// <summary>
        /// Records one execution, and fails the run if it cannot.
        ///
        /// Swallowing the failure would quietly reduce B4 to best effort — the very thing routing
        /// retrieval through the plugin exists to prevent. If the trail cannot be written, the safe
        /// outcome for a regulated report is no data, not unrecorded data.
        /// </summary>
        public void Write(ExecutionLogEntry entry)
        {
            try
            {
                _asSystem.Create(BuildRecord(entry));
            }
            catch (Exception error)
            {
                _tracing.Trace("qdb_reportexecutionlog write failed: {0}", error);
                throw new InvalidPluginExecutionException(
                    "The report ran but its execution could not be recorded in the audit log, so the "
                    + "result was withheld. Report this to an administrator: " + error.Message, error);
            }
        }

        private static Entity BuildRecord(ExecutionLogEntry entry)
        {
            var name = $"{entry.ReportName} — {entry.StartedOn:yyyy-MM-dd HH:mm:ss}";
            var record = new Entity(LogEntity);

            record["qdb_name"] = name.Length > NameMaxLength ? name.Substring(0, NameMaxLength) : name;
            record["qdb_correlationid"] = entry.CorrelationId;
            record["qdb_requestid"] = entry.CorrelationId;
            // A DateTime, not an ISO string. The retired middle tier wrote this over the Web API,
            // where a string is correct; the SDK rejects it with "Incorrect attribute value type".
            record["qdb_startedon"] = entry.StartedOn;
            record["qdb_durationms"] = entry.DurationMs;
            record["qdb_rowcount"] = entry.RowCount;
            record["qdb_resultsummary"] =
                $"user={entry.UserId}; outcome={(entry.Succeeded ? "success" : "failed")}; rows={entry.RowCount}";
            record["qdb_errorcode"] = entry.ErrorCode ?? string.Empty;
            // Only when there is a report to point at. A dashboard run has none, and binding an empty
            // GUID makes Dataverse reject the whole record — which, because the writer fails closed,
            // would withhold the dashboard's results over a lookup it never needed.
            if (entry.ReportId != Guid.Empty)
            {
                record["qdb_reportdefinitionid"] = new EntityReference("qdb_reportdefinition", entry.ReportId);
            }

            return record;
        }
    }

    /// <summary>One execution, as the audit trail records it.</summary>
    internal sealed class ExecutionLogEntry
    {
        public Guid ReportId { get; set; }

        public string ReportName { get; set; }

        public Guid UserId { get; set; }

        public string CorrelationId { get; set; }

        public DateTime StartedOn { get; set; }

        public int DurationMs { get; set; }

        public int RowCount { get; set; }

        public bool Succeeded { get; set; }

        public string ErrorCode { get; set; }
    }
}

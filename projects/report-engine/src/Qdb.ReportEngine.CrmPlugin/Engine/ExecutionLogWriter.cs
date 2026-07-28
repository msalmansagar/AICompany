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
            record["qdb_executionstage"] = new OptionSetValue(entry.Stage);
            record["qdb_cachehit"] = entry.CacheHit;
            record["qdb_resultsummary"] = Summarise(entry);
            record["qdb_errorcode"] = entry.ErrorCode ?? string.Empty;
            /* Only when there is a report to point at, and only once it is known to exist.
               A dashboard run has no report at all, and binding an empty GUID makes Dataverse reject
               the whole record — which, because the writer fails closed, would withhold the
               dashboard's results over a lookup it never needed.

               A caller asking for a report id that does not exist is the sharper case: the lookup is
               unresolvable, the create is rejected, and the probe leaves no trace precisely when an
               auditor would most want one. It cannot be recovered by catching and retrying either —
               a plugin runs in a transaction, and once an OrganizationService call has thrown,
               Dataverse refuses every later call with "ISV code reduced the open transaction count".
               So the reference is set only after the definition has actually loaded, and the failing
               write is never issued. The requested id still reaches the trail, in the summary. */
            if (entry.ReportId != Guid.Empty)
            {
                record["qdb_reportdefinitionid"] = new EntityReference("qdb_reportdefinition", entry.ReportId);
            }

            return record;
        }

        /// <summary>
        /// Who ran it and how it went — the acting user is here because the row is owned by the
        /// system. The requested report id is appended when it could not be linked, so a run against
        /// an id that does not exist still says which id was asked for.
        /// </summary>
        private static string Summarise(ExecutionLogEntry entry)
        {
            var summary = $"user={entry.UserId}; outcome={(entry.Succeeded ? "success" : "failed")}; rows={entry.RowCount}";
            var unlinked = entry.ReportId == Guid.Empty && entry.RequestedReportId != Guid.Empty;
            return unlinked ? summary + $"; requested report={entry.RequestedReportId}" : summary;
        }
    }

    /// <summary>
    /// How far a run got, as <c>qdb_executionstage</c> records it. The codes are the org's option set.
    ///
    /// A successful run ends at <see cref="Complete"/>. A failed one records the stage it was in when
    /// it threw, which is the question support actually asks: a report that dies in
    /// <see cref="LoadMetadata"/> has a broken definition, one that dies in <see cref="DataFetch"/>
    /// has a query or a privilege problem, and the error code alone does not separate them.
    ///
    /// Transform and Render are in the option set but never written here. Under ADR-RPT-011 those
    /// stages happen in the browser — formulas, transformations, layout and exports all run in the
    /// web resource — so the plugin cannot observe them and does not pretend to.
    /// </summary>
    internal static class ExecutionStage
    {
        public const int Validate = 100000000;
        public const int LoadMetadata = 100000001;
        public const int DataFetch = 100000002;
        public const int Complete = 100000005;

        /// <summary>A failure that never reached a stage — it broke before validation began.</summary>
        public const int Failed = 100000006;
    }

    /// <summary>One execution, as the audit trail records it.</summary>
    internal sealed class ExecutionLogEntry
    {
        /// <summary>
        /// The report to link the row to. Set only once the definition has loaded, because a lookup
        /// to a report that does not exist makes Dataverse reject the whole audit record.
        /// </summary>
        public Guid ReportId { get; set; }

        /// <summary>The id the caller asked for, which may not exist. Kept for the summary.</summary>
        public Guid RequestedReportId { get; set; }

        public string ReportName { get; set; }

        public Guid UserId { get; set; }

        public string CorrelationId { get; set; }

        public DateTime StartedOn { get; set; }

        public int DurationMs { get; set; }

        public int RowCount { get; set; }

        public bool Succeeded { get; set; }

        public string ErrorCode { get; set; }

        /// <summary>
        /// The stage the run reached. Starts at <see cref="ExecutionStage.Failed"/> so a run that
        /// throws before it does anything is still recorded as having got nowhere, rather than
        /// defaulting to a stage it never entered.
        /// </summary>
        public int Stage { get; set; } = ExecutionStage.Failed;

        /// <summary>
        /// Whether the rows came from a cache rather than from Dataverse.
        ///
        /// Always false today: <c>qdb_reportcache</c> exists in the schema but nothing reads or writes
        /// it, so every run goes to source. It is recorded rather than left blank because "these rows
        /// are live" is a fact an auditor needs — a blank column cannot distinguish a fresh read from
        /// a cached one — and because the field starts varying by itself the day a cache is built.
        /// </summary>
        public bool CacheHit { get; set; }
    }
}

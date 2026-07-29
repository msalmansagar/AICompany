using System;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Writes the <c>qdb_reportauditlog</c> row for one configuration change.
    ///
    /// Written with the system identity so a user who cannot create audit records still leaves one,
    /// and owned by the user who made the change so the trail names them without needing a field of
    /// its own. Keeping the row immutable afterwards is a matter of privileges on the table — the
    /// standing rule is that audit tables take no update or delete — and not something this code can
    /// enforce.
    ///
    /// A failure here fails the change. The plugin is registered synchronously and in transaction, so
    /// a report edit that cannot be recorded is rolled back rather than applied unrecorded, which is
    /// the same bargain report execution already makes.
    /// </summary>
    internal sealed class ReportAuditWriter
    {
        private const string AuditEntity = "qdb_reportauditlog";
        private const int NameMaxLength = 100;

        private readonly IOrganizationService _asSystem;
        private readonly ITracingService _tracing;

        public ReportAuditWriter(IOrganizationService asSystem, ITracingService tracing)
        {
            _asSystem = asSystem;
            _tracing = tracing;
        }

        public void Write(ReportChange change)
        {
            try
            {
                _asSystem.Create(BuildRecord(change));
            }
            catch (Exception error)
            {
                _tracing.Trace("qdb_reportauditlog write failed: {0}", error);
                throw new InvalidPluginExecutionException(
                    "The change could not be recorded in the report audit log, so it was not applied. "
                    + "Report this to an administrator: " + error.Message, error);
            }
        }

        private static Entity BuildRecord(ReportChange change)
        {
            var name = $"{AuditAction.Label(change.Action)} — {change.ReportName ?? "report"}";
            var record = new Entity(AuditEntity);

            record["qdb_name"] = name.Length > NameMaxLength ? name.Substring(0, NameMaxLength) : name;
            record["qdb_actiontype"] = new OptionSetValue(change.Action);
            record["qdb_changedon"] = DateTime.UtcNow;
            record["qdb_beforejson"] = change.Before;
            record["qdb_afterjson"] = change.After;
            record["qdb_comment"] = Comment(change);

            // Owned by whoever made the change, which is what the Audit Log view reads for "Changed by".
            if (change.UserId != Guid.Empty)
            {
                record["ownerid"] = new EntityReference("systemuser", change.UserId);
            }

            // Only when the report still exists. A delete cannot be linked to the row it removed —
            // Dataverse rejects a lookup to a missing record — so the id travels in the comment.
            if (change.ReportId != Guid.Empty)
            {
                record["qdb_reportdefinitionid"] = new EntityReference("qdb_reportdefinition", change.ReportId);
            }

            return record;
        }

        /// <summary>
        /// The report's id, on every row, in a form that survives the report itself.
        ///
        /// The lookup is not enough. Its cascade is RemoveLink, so deleting a report silently clears
        /// the reference on all of its history — the rows remain but stop saying what they were
        /// about, which is precisely when an auditor comes looking. Recording the id as text keeps
        /// the trail answerable after the record is gone.
        /// </summary>
        private static string Comment(ReportChange change)
        {
            var reportId = change.ReportId != Guid.Empty ? change.ReportId : change.DeletedReportId;
            if (reportId == Guid.Empty) return null;
            return change.DeletedReportId != Guid.Empty
                ? $"report={reportId}; deleted"
                : $"report={reportId}";
        }
    }
}

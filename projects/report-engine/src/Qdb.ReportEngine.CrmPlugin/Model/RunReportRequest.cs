using System;

namespace Qdb.ReportEngine.CrmPlugin.Model
{
    /// <summary>The typed inputs of a <c>qdb_RunReport</c> call, read from the plugin's InputParameters.</summary>
    internal sealed class RunReportRequest
    {
        public RunReportRequest(Guid reportId, Guid callerId, string parametersJson, ReportFormat format, bool async)
        {
            ReportId = reportId;
            CallerId = callerId;
            ParametersJson = parametersJson;
            Format = format;
            Async = async;
        }

        public Guid ReportId { get; }

        /// <summary>The signed-in CRM user; relayed to the middle-tier for per-user (impersonated) execution.</summary>
        public Guid CallerId { get; }

        /// <summary>
        /// Set together when the call is a drilldown: the relationship to follow, and the parent row's
        /// key the child query is scoped to. Both empty for an ordinary run.
        /// </summary>
        public Guid RelationshipId { get; set; }

        public string ParentKey { get; set; }

        public bool IsDrilldown => RelationshipId != Guid.Empty && !string.IsNullOrEmpty(ParentKey);

        /// <summary>User-supplied runtime parameter values as JSON, or empty for none.</summary>
        public string ParametersJson { get; }

        public ReportFormat Format { get; }

        public bool Async { get; }
    }
}

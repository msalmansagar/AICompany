namespace Qdb.ReportEngine.CrmPlugin
{
    /// <summary>
    /// Custom API / Custom Action parameter names for <c>qdb_RunReport</c> (arch §5.2/5.3). These are
    /// the contract between the CRM caller (ribbon / Xrm.WebApi) and the plugin; they must match the
    /// registered request/response parameters exactly.
    /// </summary>
    internal static class ReportEngineParameters
    {
        // Request
        public const string ReportId = "reportId";
        public const string ContextJson = "contextJson";
        public const string ParametersJson = "parametersJson";
        public const string Format = "format";
        public const string Async = "async";

        /// <summary>Drilldown: which relationship on the report to follow. Absent for a normal run.</summary>
        public const string RelationshipId = "relationshipId";

        /// <summary>Drilldown: the parent row's key value the child query is scoped to.</summary>
        public const string ParentKey = "parentKey";

        // Response
        public const string ExecutionId = "executionId";
        public const string Mode = "mode";
        public const string ResultJson = "resultJson";
        public const string JobId = "jobId";
        public const string StatusPollUrl = "statusPollUrl";
        public const string ErrorCode = "errorCode";
        public const string ErrorMessage = "errorMessage";
    }
}

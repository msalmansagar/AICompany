namespace Qdb.ReportEngine.CrmPlugin.Model
{
    /// <summary>
    /// What a report run hands back, whichever way it was invoked.
    ///
    /// Every field is populated on both the success and failure paths, because the Custom API and the
    /// Custom Action both declare all seven as outputs and writing only some of them fails on the
    /// one that is missing.
    /// </summary>
    internal sealed class RunReportOutcome
    {
        private RunReportOutcome(string resultJson, string executionId, string errorCode, string errorMessage)
        {
            ResultJson = resultJson;
            ExecutionId = executionId;
            ErrorCode = errorCode;
            ErrorMessage = errorMessage;
        }

        /// <summary>The shaped result as JSON. Empty when the run failed.</summary>
        public string ResultJson { get; }

        /// <summary>
        /// The correlation id of the audit row this run wrote.
        ///
        /// It is the log's own id rather than a fresh one, so a user quoting the id they were given
        /// can be found in qdb_reportexecutionlog. The two used to be separate values, which meant
        /// the identifier handed to the caller appeared nowhere in the trail.
        /// </summary>
        public string ExecutionId { get; }

        /// <summary>Empty on success. A refusal carries its code here with an HTTP 200.</summary>
        public string ErrorCode { get; }

        /// <summary>Empty on success.</summary>
        public string ErrorMessage { get; }

        /// <summary>Synchronous is the only mode the engine runs in today.</summary>
        public string Mode => "SYNC";

        /// <summary>Reserved for asynchronous runs, which do not exist yet.</summary>
        public string JobId => string.Empty;

        /// <summary>Reserved for asynchronous runs, which do not exist yet.</summary>
        public string StatusPollUrl => string.Empty;

        public static RunReportOutcome Success(string resultJson, string correlationId) =>
            new RunReportOutcome(resultJson, correlationId, string.Empty, string.Empty);

        public static RunReportOutcome Failed(string errorCode, string message, string correlationId) =>
            new RunReportOutcome(string.Empty, correlationId, errorCode, message);
    }
}

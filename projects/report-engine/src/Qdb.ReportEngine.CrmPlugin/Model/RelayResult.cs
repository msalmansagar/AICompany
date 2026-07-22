namespace Qdb.ReportEngine.CrmPlugin.Model
{
    /// <summary>
    /// The outcome of relaying a run to the middle tier. Success carries the payload the caller gets
    /// back in <c>resultJson</c> (JSON rows for a run, or a base64 file for an export); failure and
    /// timeout carry a structured error so the Custom API returns cleanly rather than faulting.
    /// </summary>
    internal sealed class RelayResult
    {
        private RelayResult(bool succeeded, string payload, string errorCode, string errorMessage)
        {
            Succeeded = succeeded;
            Payload = payload;
            ErrorCode = errorCode;
            ErrorMessage = errorMessage;
        }

        public bool Succeeded { get; }

        public string Payload { get; }

        public string ErrorCode { get; }

        public string ErrorMessage { get; }

        public static RelayResult Success(string payload) => new RelayResult(true, payload, null, null);

        public static RelayResult Failure(string code, string message) => new RelayResult(false, null, code, message);

        public static RelayResult Timeout() => new RelayResult(false, null, "execution_timeout", "The report did not complete within the synchronous time limit.");
    }
}

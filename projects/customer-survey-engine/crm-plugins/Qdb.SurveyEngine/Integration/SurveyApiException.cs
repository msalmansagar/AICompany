using System;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// A refusal from one of the integration APIs (section 9.6). The code is the contract: Dataverse
    /// returns every plugin refusal as HTTP 400, so callers read the code from the start of the
    /// message, e.g. "survey_expired: The invitation expired on 2026-05-01.".
    /// </summary>
    public sealed class SurveyApiException : Exception
    {
        public const string BadRequest = "survey_bad_request";
        public const string Forbidden = "survey_forbidden";
        public const string NotFound = "survey_not_found";
        public const string Expired = "survey_expired";
        public const string AlreadySubmitted = "survey_already_submitted";

        public SurveyApiException(string code, string detail)
            : base(code + ": " + detail)
        {
            Code = code ?? throw new ArgumentNullException(nameof(code));
        }

        /// <summary>One of the survey_* codes above.</summary>
        public string Code { get; }
    }
}

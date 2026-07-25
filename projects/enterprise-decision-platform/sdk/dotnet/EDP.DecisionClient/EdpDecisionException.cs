using System;

namespace Edp.DecisionClient
{
    /// <summary>Thrown when the gateway returns a non-2xx response.</summary>
    public sealed class EdpDecisionException : Exception
    {
        public string Code { get; }
        public int StatusCode { get; }

        public EdpDecisionException(string code, string message, int statusCode) : base(message)
        {
            Code = code;
            StatusCode = statusCode;
        }
    }
}

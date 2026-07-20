namespace Qdb.ReportEngine.Core.Common;

/// <summary>
/// Raised when Dataverse rejects a request with a service-protection limit (HTTP 429).
/// Carries the server-supplied <see cref="RetryAfter"/> so the resilience policy waits the
/// exact interval before retrying (ADR-RPT-008 §6).
/// </summary>
public sealed class DataverseThrottledException(TimeSpan retryAfter, string? message = null)
    : Exception(message ?? "Dataverse throttled the request (service-protection limit).")
{
    /// <summary>The interval the server asked the client to wait before retrying.</summary>
    public TimeSpan RetryAfter { get; } = retryAfter;
}

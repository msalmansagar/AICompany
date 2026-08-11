namespace Qdb.ReportEngine.Core.Common;

/// <summary>
/// Raised when Dataverse denies a request (HTTP 403) — the impersonated user lacks the privilege to
/// read the requested data. Distinct from a transport failure so the engine can surface a clean
/// "no access" outcome instead of a generic error (AUTH-C-8).
/// </summary>
public sealed class DataverseAccessDeniedException(string entity, string? message = null)
    : Exception(message ?? $"Access denied to {entity}.")
{
    /// <summary>The entity the caller was denied access to.</summary>
    public string Entity { get; } = entity;
}

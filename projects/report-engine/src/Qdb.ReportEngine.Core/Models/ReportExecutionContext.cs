namespace Qdb.ReportEngine.Core.Models;

/// <summary>
/// The security and request context under which a dashboard/report executes. Carries the
/// requesting user's identity and delegated token so queries run as that user
/// (ADR-RPT-008 §1 — OBO / impersonation distributes CRM quota per identity).
/// </summary>
public sealed record ReportExecutionContext
{
    /// <summary>The requesting user's Azure AD object id (cloud) or systemuser id (on-prem).</summary>
    public required Guid UserId { get; init; }

    /// <summary>The user's business unit id, for BU-scoped queries.</summary>
    public Guid BusinessUnitId { get; init; }

    /// <summary>
    /// The user's delegated access token (cloud OBO). On-prem uses <see cref="UserId"/>
    /// for Organization Service impersonation instead. Never logged.
    /// </summary>
    public string? DelegatedToken { get; init; }

    /// <summary>
    /// Deterministic hash of the user's sorted CRM security-role ids. Part of the cache key
    /// so users with identical role sets share cache entries (ADR-RPT-007).
    /// </summary>
    public required string RoleSetHash { get; init; }

    /// <summary>Correlation id for tracing this execution end-to-end.</summary>
    public string CorrelationId { get; init; } = Guid.NewGuid().ToString("N");
}

namespace Qdb.ReportEngine.Core.Security;

/// <summary>
/// The authenticated caller, reduced to the only three facts the impersonation decision needs.
/// Deliberately free of any transport or ASP.NET type so the policy that consumes it stays pure
/// and testable — the API layer projects its <c>ClaimsPrincipal</c> onto this shape.
/// </summary>
public sealed record CallerPrincipal
{
    /// <summary>True when the request presented credentials the middle-tier validated.</summary>
    public required bool IsAuthenticated { get; init; }

    /// <summary>
    /// True only for a trusted service identity — a CRM entry point relaying on a user's behalf.
    /// Such a caller names the acting user; every other caller may act only as itself.
    /// </summary>
    public bool CanAssertCaller { get; init; }

    /// <summary>
    /// The caller's own identity from its validated token (the Entra <c>oid</c> claim on cloud).
    /// Absent for a service identity, which has no user of its own.
    /// </summary>
    public Guid? SubjectId { get; init; }
}

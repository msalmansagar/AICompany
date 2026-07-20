using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Produces a CRM connection that executes <b>as the requesting user</b>, so the ~52
/// concurrent-request Dataverse limit applies per user identity, not per shared service
/// principal (ADR-RPT-008 §1). Cloud uses MSAL On-Behalf-Of delegated tokens; on-prem 9.x
/// uses Organization Service impersonation (<c>CallerId</c> / <c>CallerObjectId</c>).
/// </summary>
public interface IDataverseConnectionFactory
{
    /// <summary>
    /// Acquires a per-user connection handle for <paramref name="context"/>. The caller disposes it.
    /// Implementations must never fall back to raw service-principal execution silently.
    /// </summary>
    Task<IDataverseConnection> CreateForUserAsync(ReportExecutionContext context, CancellationToken cancellationToken);
}

/// <summary>An opened, per-user CRM connection. Disposal returns any pooled resources.</summary>
public interface IDataverseConnection : IAsyncDisposable
{
    /// <summary>The identity this connection executes as, for audit/telemetry.</summary>
    Guid ExecutingUserId { get; }
}

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

    /// <summary>
    /// Executes one aggregate FetchXML query against <paramref name="entityLogicalName"/> and returns
    /// the raw attribute rows (alias → value). Throws <c>DataverseThrottledException</c> on HTTP 429.
    /// </summary>
    Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> RetrieveMultipleAsync(
        string entityLogicalName, string fetchXml, CancellationToken cancellationToken);

    /// <summary>
    /// Executes several FetchXML queries in a single OData <c>$batch</c> round-trip (ADR-RPT-008 §3),
    /// returning each query's raw rows keyed by the caller's correlation id. Order is preserved.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> RetrieveMultipleBatchAsync(
        IReadOnlyList<BatchQuery> queries, CancellationToken cancellationToken);
}

/// <summary>One FetchXML query in a batch, tagged with the widget id it resolves.</summary>
public sealed record BatchQuery(Guid WidgetId, string EntityLogicalName, string FetchXml);

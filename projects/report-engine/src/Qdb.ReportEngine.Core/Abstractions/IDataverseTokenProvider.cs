using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Acquires a Dataverse access token for a request. The current implementation uses app-only
/// (client-credentials) auth; the OBO delegated-token path (ADR-RPT-008 §1) swaps in behind this
/// interface once the permitted Azure region is confirmed (AUTH-C-2), without touching callers.
/// </summary>
public interface IDataverseTokenProvider
{
    /// <summary>Returns a bearer token for the Dataverse Web API under <paramref name="context"/>.</summary>
    Task<string> GetAccessTokenAsync(ReportExecutionContext context, CancellationToken cancellationToken);
}

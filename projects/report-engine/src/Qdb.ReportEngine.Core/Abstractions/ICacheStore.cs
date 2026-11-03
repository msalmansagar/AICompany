using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Role-keyed result cache (ADR-RPT-007). Stores raw aggregated data keyed by
/// <c>SHA-256(widgetId | sortedParams | roleSetHash [| userId])</c>; the store is never
/// exposed to browser clients and holds unmasked data behind the service account.
/// </summary>
public interface ICacheStore
{
    /// <summary>Returns the cached data points for <paramref name="cacheKey"/>, or <c>null</c> on a miss.</summary>
    Task<IReadOnlyList<DataPoint>?> GetAsync(string cacheKey, CancellationToken cancellationToken);

    /// <summary>Caches <paramref name="data"/> under <paramref name="cacheKey"/> for <paramref name="ttl"/>.</summary>
    Task SetAsync(string cacheKey, IReadOnlyList<DataPoint> data, TimeSpan ttl, CancellationToken cancellationToken);
}

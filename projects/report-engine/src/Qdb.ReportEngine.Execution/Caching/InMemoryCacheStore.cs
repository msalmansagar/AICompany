using System.Collections.Concurrent;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Caching;

/// <summary>
/// In-memory <see cref="ICacheStore"/> for the scaffold and local development. Production
/// uses the distributed cache from ADR-RPT-007 (Azure Redis on cloud, SQL Server distributed
/// cache on-prem) behind the same interface. Registered as a singleton.
/// </summary>
public sealed class InMemoryCacheStore : ICacheStore
{
    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    /// <inheritdoc />
    public Task<IReadOnlyList<DataPoint>?> GetAsync(string cacheKey, CancellationToken cancellationToken)
    {
        if (_entries.TryGetValue(cacheKey, out var entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return Task.FromResult<IReadOnlyList<DataPoint>?>(entry.Data);
        }

        _entries.TryRemove(cacheKey, out _);
        return Task.FromResult<IReadOnlyList<DataPoint>?>(null);
    }

    /// <inheritdoc />
    public Task SetAsync(string cacheKey, IReadOnlyList<DataPoint> data, TimeSpan ttl, CancellationToken cancellationToken)
    {
        _entries[cacheKey] = new Entry(data, DateTimeOffset.UtcNow.Add(ttl));
        return Task.CompletedTask;
    }

    private sealed record Entry(IReadOnlyList<DataPoint> Data, DateTimeOffset ExpiresAt);
}

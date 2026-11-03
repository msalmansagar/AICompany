using System.Collections.Concurrent;
using Qdb.ReportEngine.Core.Abstractions;

namespace Qdb.ReportEngine.Execution.Resilience;

/// <summary>
/// Coalesces concurrent requests for the same key into one execution (ADR-RPT-008 §6).
/// The first caller runs the factory; concurrent callers for the same key await the same
/// task. The entry is removed once the task completes so the next miss re-executes.
/// Registered as a singleton so coalescing spans concurrent dashboard opens process-wide.
/// </summary>
public sealed class InFlightRequestCoalescer : IInFlightRequestCoalescer
{
    private readonly ConcurrentDictionary<string, Lazy<Task<object?>>> _inFlight = new();

    /// <inheritdoc />
    public async Task<T> GetOrAddAsync<T>(string key, Func<CancellationToken, Task<T>> factory, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(key);

        var lazy = _inFlight.GetOrAdd(key, _ => new Lazy<Task<object?>>(
            () => RunAsync(factory, cancellationToken)));
        try
        {
            var result = await lazy.Value.ConfigureAwait(false);
            return (T)result!;
        }
        finally
        {
            _inFlight.TryRemove(key, out _);
        }
    }

    private static async Task<object?> RunAsync<T>(Func<CancellationToken, Task<T>> factory, CancellationToken ct)
        => await factory(ct).ConfigureAwait(false);
}

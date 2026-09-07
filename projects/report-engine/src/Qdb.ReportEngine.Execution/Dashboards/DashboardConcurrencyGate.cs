using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Configuration;

namespace Qdb.ReportEngine.Execution.Dashboards;

/// <summary>
/// The two-level concurrency cap of ADR-RPT-008 §2. A process-wide semaphore bounds total
/// concurrent CRM connections across the middle tier; callers additionally create a
/// per-dashboard semaphore to bound one dashboard's simultaneous widget fetches.
/// Registered as a singleton so the global cap is shared across all executions.
/// </summary>
public sealed class DashboardConcurrencyGate : IDisposable
{
    private readonly SemaphoreSlim _globalGate;
    private readonly int _perDashboardLimit;

    public DashboardConcurrencyGate(IOptions<DashboardOptions> options)
    {
        var o = options.Value;
        _globalGate = new SemaphoreSlim(o.MaxConcurrentQueries, o.MaxConcurrentQueries);
        _perDashboardLimit = o.MaxConcurrentWidgetQueries;
    }

    /// <summary>Creates a fresh per-dashboard limiter for a single dashboard execution.</summary>
    public SemaphoreSlim CreatePerDashboardLimiter() => new(_perDashboardLimit, _perDashboardLimit);

    /// <summary>
    /// Acquires one slot from the global process gate, waiting if the middle tier is at its
    /// concurrent-CRM-connection ceiling. Dispose the returned lease to release the slot.
    /// </summary>
    public async Task<IDisposable> AcquireGlobalAsync(CancellationToken cancellationToken)
    {
        await _globalGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        return new Lease(_globalGate);
    }

    public void Dispose() => _globalGate.Dispose();

    private sealed class Lease(SemaphoreSlim gate) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                gate.Release();
            }
        }
    }
}

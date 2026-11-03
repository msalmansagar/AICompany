using Qdb.ReportEngine.Execution.Resilience;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class InFlightRequestCoalescerTests
{
    [Fact]
    public async Task GetOrAddAsync_ConcurrentCallersSameKey_InvokeFactoryOnce()
    {
        var coalescer = new InFlightRequestCoalescer();
        var gate = new TaskCompletionSource();
        var invocations = 0;

        async Task<int> Factory(CancellationToken ct)
        {
            Interlocked.Increment(ref invocations);
            await gate.Task.ConfigureAwait(false); // hold until all callers have registered
            return 42;
        }

        // Launch five concurrent callers for the same key while the factory is held open.
        var callers = Enumerable.Range(0, 5)
            .Select(_ => coalescer.GetOrAddAsync("key", Factory, CancellationToken.None))
            .ToArray();

        gate.SetResult();
        var results = await Task.WhenAll(callers);

        Assert.Equal(1, invocations);
        Assert.All(results, r => Assert.Equal(42, r));
    }

    [Fact]
    public async Task GetOrAddAsync_SequentialCallsAfterCompletion_ReExecuteFactory()
    {
        var coalescer = new InFlightRequestCoalescer();
        var invocations = 0;

        Task<int> Factory(CancellationToken ct)
        {
            Interlocked.Increment(ref invocations);
            return Task.FromResult(7);
        }

        await coalescer.GetOrAddAsync("key", Factory, CancellationToken.None);
        await coalescer.GetOrAddAsync("key", Factory, CancellationToken.None);

        Assert.Equal(2, invocations);
    }
}

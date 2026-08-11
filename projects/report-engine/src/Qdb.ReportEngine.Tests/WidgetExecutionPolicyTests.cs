using Microsoft.Extensions.Logging.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Execution.Resilience;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class WidgetExecutionPolicyTests
{
    [Fact]
    public async Task ExecuteAsync_ThrottledThenSucceeds_RetriesAndReturnsResult()
    {
        var policy = new WidgetExecutionPolicy(NullLogger<WidgetExecutionPolicy>.Instance);
        var attempts = 0;

        var result = await policy.ExecuteAsync<int>("dataverse", _ =>
        {
            attempts++;
            if (attempts < 3)
            {
                throw new DataverseThrottledException(TimeSpan.FromMilliseconds(5));
            }

            return Task.FromResult(99);
        }, CancellationToken.None);

        Assert.Equal(99, result);
        Assert.Equal(3, attempts); // two throttles retried, third succeeds
    }

    [Fact]
    public async Task ExecuteAsync_NonThrottleException_DoesNotRetry()
    {
        var policy = new WidgetExecutionPolicy(NullLogger<WidgetExecutionPolicy>.Instance);
        var attempts = 0;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            policy.ExecuteAsync<int>("dataverse", _ =>
            {
                attempts++;
                throw new InvalidOperationException("boom");
            }, CancellationToken.None));

        Assert.Equal(1, attempts); // not a throttle → no retry
    }
}

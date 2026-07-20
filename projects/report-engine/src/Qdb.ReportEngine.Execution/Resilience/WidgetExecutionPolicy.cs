using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;

namespace Qdb.ReportEngine.Execution.Resilience;

/// <summary>
/// Retry + circuit-breaker resilience for CRM queries (ADR-RPT-008 §6). Retries throttling
/// (429) responses using the server-supplied <c>Retry-After</c> interval with exponential
/// fallback, and opens a per-target circuit breaker after sustained failure. One Polly
/// pipeline is built and cached per target so the breaker state is shared across queries.
/// </summary>
public sealed class WidgetExecutionPolicy(ILogger<WidgetExecutionPolicy> logger) : IWidgetExecutionPolicy
{
    private const int MaxRetries = 4;
    private readonly ConcurrentDictionary<string, ResiliencePipeline> _pipelines = new();

    /// <inheritdoc />
    public Task<T> ExecuteAsync<T>(string target, Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(target);
        ArgumentNullException.ThrowIfNull(operation);

        var pipeline = _pipelines.GetOrAdd(target, BuildPipeline);
        return pipeline.ExecuteAsync(async ct => await operation(ct).ConfigureAwait(false), cancellationToken).AsTask();
    }

    private ResiliencePipeline BuildPipeline(string target) => new ResiliencePipelineBuilder()
        .AddRetry(new RetryStrategyOptions
        {
            ShouldHandle = new PredicateBuilder().Handle<DataverseThrottledException>(),
            MaxRetryAttempts = MaxRetries,
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            // Honour the server-supplied Retry-After when present (ADR-RPT-008 §6).
            DelayGenerator = args => new ValueTask<TimeSpan?>(
                args.Outcome.Exception is DataverseThrottledException t ? t.RetryAfter : (TimeSpan?)null),
            OnRetry = args =>
            {
                logger.LogWarning("Retry {Attempt}/{Max} against {Target} after throttle (delay {Delay}).",
                    args.AttemptNumber + 1, MaxRetries, target, args.RetryDelay);
                return default;
            }
        })
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            ShouldHandle = new PredicateBuilder().Handle<DataverseThrottledException>(),
            FailureRatio = 0.5,
            MinimumThroughput = 10,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(15)
        })
        .Build();
}

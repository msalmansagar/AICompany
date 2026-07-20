using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;

namespace Qdb.ReportEngine.Execution.Resilience;

/// <summary>
/// Retry + circuit-breaker policy for CRM queries (ADR-RPT-008 §6). Skeleton — the retry
/// currently passes through; the build replaces the body with a Polly pipeline that honours
/// the Dataverse <c>Retry-After</c> header on 429 and opens a per-target circuit breaker.
/// </summary>
public sealed class WidgetExecutionPolicy(ILogger<WidgetExecutionPolicy> logger) : IWidgetExecutionPolicy
{
    /// <inheritdoc />
    public async Task<T> ExecuteAsync<T>(string target, Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);

        // TODO(build): wrap with Polly — WaitAndRetry honouring Retry-After header + exponential
        // backoff on ServiceProtectionApiTooManyRequests (429), and a per-target CircuitBreaker.
        // Skeleton executes the operation once.
        try
        {
            return await operation(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Query against {Target} failed (no retry in scaffold).", target);
            throw;
        }
    }
}

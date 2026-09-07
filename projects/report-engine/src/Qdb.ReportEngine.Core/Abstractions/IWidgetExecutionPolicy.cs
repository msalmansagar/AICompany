namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Wraps a widget query with resilience (ADR-RPT-008 §6): retry that honours the Dataverse
/// <c>Retry-After</c> header with exponential backoff, plus a per-target circuit breaker.
/// </summary>
public interface IWidgetExecutionPolicy
{
    /// <summary>Executes <paramref name="operation"/> under the retry + circuit-breaker policy for <paramref name="target"/>.</summary>
    Task<T> ExecuteAsync<T>(string target, Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken);
}

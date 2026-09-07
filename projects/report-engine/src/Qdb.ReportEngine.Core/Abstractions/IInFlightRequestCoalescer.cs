namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Collapses concurrent requests for the same cache key into a single in-flight execution
/// (ADR-RPT-008 §6). A burst of identical widget requests issues one CRM call; all callers
/// await the same task.
/// </summary>
public interface IInFlightRequestCoalescer
{
    /// <summary>
    /// Returns the result for <paramref name="key"/>, invoking <paramref name="factory"/> only
    /// if no execution for that key is already in flight; otherwise awaits the existing one.
    /// </summary>
    Task<T> GetOrAddAsync<T>(string key, Func<CancellationToken, Task<T>> factory, CancellationToken cancellationToken);
}

using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Carries the execution context resolved for the current request, so controllers state which user
/// they act as by reading one value rather than each re-deriving it from headers.
/// </summary>
public sealed class CallerContext
{
    /// <summary>Set by <see cref="ResolveCallerContextFilter"/> once the caller is resolved.</summary>
    public ReportExecutionContext? Value { get; set; }

    /// <summary>
    /// The resolved context. Throws when the resolving filter did not run, which is a wiring
    /// mistake rather than a request problem — failing loudly beats executing as nobody.
    /// </summary>
    public ReportExecutionContext Require() => Value
        ?? throw new InvalidOperationException(
            $"No caller context was resolved. {nameof(ResolveCallerContextFilter)} must be registered globally.");
}

namespace Qdb.ReportEngine.Core.Common;

/// <summary>
/// A typed, code-carrying error surfaced by the engine at a boundary. Specific error
/// <see cref="Code"/>s let callers branch without string matching on messages.
/// </summary>
/// <param name="Code">Stable machine-readable slug, e.g. <c>dashboard_not_found</c>.</param>
/// <param name="Message">Human-readable description (never contains PII).</param>
public sealed record DomainError(string Code, string Message)
{
    public static DomainError NotFound(string what) => new("not_found", $"{what} was not found.");

    public static DomainError Throttled(string target) => new("throttled", $"{target} throttled the request.");

    public static DomainError PermissionDenied(string entity) => new("permission_denied", $"No read access to {entity}.");

    public static DomainError NotImplemented(string what) => new("not_implemented", $"{what} is not implemented in the scaffold.");
}

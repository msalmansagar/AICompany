using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Security;

/// <summary>
/// Answers entity-access and ownership questions from CRM metadata + the user's roles.
/// Skeleton — allows reads and reports BU/organisation ownership by default; the build wires
/// <c>RetrieveEntityMetadata</c> (ownership type) and a privilege check against the user's roles
/// (AUTH-C-8 per-widget permission; DC-1b user-owned cache keying).
/// </summary>
public sealed class CrmSecurityEnforcer : ISecurityEnforcer
{
    /// <inheritdoc />
    public Task<bool> CanReadEntityAsync(string entity, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entity);
        // TODO(build): check the user's read privilege on `entity` via CRM security; deny -> AccessDenied widget.
        return Task.FromResult(true);
    }

    /// <inheritdoc />
    public Task<bool> IsUserOwnedEntityAsync(string entity, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entity);
        // TODO(build): read OwnershipType from entity metadata; UserOwned -> true (forces userId into cache key).
        return Task.FromResult(false);
    }
}

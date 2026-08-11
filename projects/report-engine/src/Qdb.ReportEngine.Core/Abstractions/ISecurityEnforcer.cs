using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Answers security questions the dashboard fan-out needs before it queries or caches:
/// whether the user may read an entity (AUTH-C-8), and whether an entity is user-owned
/// (which forces <c>userId</c> into the cache key — DC-1b / ADR-RPT-008 §4).
/// </summary>
public interface ISecurityEnforcer
{
    /// <summary>True when <paramref name="context"/>'s user has read access to <paramref name="entity"/>.</summary>
    Task<bool> CanReadEntityAsync(string entity, ReportExecutionContext context, CancellationToken cancellationToken);

    /// <summary>
    /// True when <paramref name="entity"/> is user-owned (as opposed to BU/organisation owned).
    /// User-owned entities must key their widget cache by <c>userId</c> to preserve row-level correctness.
    /// </summary>
    Task<bool> IsUserOwnedEntityAsync(string entity, CancellationToken cancellationToken);
}

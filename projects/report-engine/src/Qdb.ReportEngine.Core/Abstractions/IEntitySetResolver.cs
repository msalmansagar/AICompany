namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Resolves an entity's logical name to its Web API entity-set (collection) name — needed to
/// address FetchXML queries (<c>GET /{entityset}?fetchXml=…</c>). Results are cached because
/// entity-set names are static metadata.
/// </summary>
public interface IEntitySetResolver
{
    /// <summary>Returns the entity-set name for <paramref name="entityLogicalName"/>.</summary>
    Task<string> ResolveAsync(string entityLogicalName, CancellationToken cancellationToken);
}

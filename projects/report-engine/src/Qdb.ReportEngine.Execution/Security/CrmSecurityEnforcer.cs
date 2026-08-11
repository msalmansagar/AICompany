using System.Collections.Concurrent;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Security;

/// <summary>
/// Enforces entity read access by probing Dataverse <b>as the requesting user</b> (impersonation):
/// a denied entity surfaces as a clean "no access" outcome instead of an error, and the check is
/// cached per role set. The impersonated data query remains the authoritative gate — a transient
/// probe failure defers to it rather than hard-denying.
/// </summary>
public sealed class CrmSecurityEnforcer(
    IDataverseConnectionFactory connectionFactory, ILogger<CrmSecurityEnforcer> logger) : ISecurityEnforcer
{
    private static readonly ConcurrentDictionary<string, bool> ReadAccessCache = new(StringComparer.Ordinal);

    /// <inheritdoc />
    public async Task<bool> CanReadEntityAsync(string entity, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entity);
        ArgumentNullException.ThrowIfNull(context);

        var cacheKey = $"{context.RoleSetHash}|{entity}";
        if (ReadAccessCache.TryGetValue(cacheKey, out var cached))
        {
            return cached;
        }

        var allowed = await ProbeReadAccessAsync(entity, context, cancellationToken).ConfigureAwait(false);
        ReadAccessCache[cacheKey] = allowed;
        return allowed;
    }

    /// <inheritdoc />
    public Task<bool> IsUserOwnedEntityAsync(string entity, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entity);

        // Conservative: treat every entity as user-owned so CacheKeyBuilder always scopes cache
        // entries to the user id — preventing one user's rows being served to another with the same
        // role set. Refine with real OwnershipType metadata when a metadata reader is available.
        return Task.FromResult(true);
    }

    // A minimal top-1 query as the user: success (even with 0 rows) = readable; 403 = denied.
    private async Task<bool> ProbeReadAccessAsync(string entity, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        var probe = new XElement("fetch", new XAttribute("top", 1), new XElement("entity", new XAttribute("name", entity)))
            .ToString(SaveOptions.DisableFormatting);
        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            await connection.RetrieveMultipleAsync(entity, probe, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (DataverseAccessDeniedException)
        {
            return false;
        }
        catch (Exception ex) when (ex is not OperationCanceledException and not DataverseThrottledException)
        {
            logger.LogWarning(ex, "Read-access probe for {Entity} failed; deferring to the data query.", entity);
            return true; // the impersonated data query is the authoritative gate.
        }
    }
}

using Microsoft.Extensions.Options;
using Mss.Dataverse;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Resolves entity logical names to Web API entity-set names. A thin adapter
/// over the shared <c>Mss.Dataverse</c> library (vendored under ../Global, see
/// GLOBAL-VERSION) — the entity-set resolution, direct EntityDefinitions lookup,
/// and process-wide caching now live in the canonical package.
///
/// Metadata is not user-scoped, so it reads with an app token via a fixed
/// metadata context. Held as a singleton so the canonical's cache is shared.
/// </summary>
public sealed class EntitySetResolver : IEntitySetResolver
{
    private readonly IDataverseMetadata _metadata;

    public EntitySetResolver(
        IHttpClientFactory httpClientFactory,
        IDataverseTokenProvider tokenProvider,
        IOptions<DataverseOptions> options)
    {
        _metadata = new DataverseMetadataService(
            httpClientFactory,
            new MetadataTokenSource(tokenProvider),
            options.Value.Url,
            options.Value.ApiVersion);
    }

    /// <inheritdoc />
    public Task<string> ResolveAsync(string entityLogicalName, CancellationToken cancellationToken)
        => _metadata.ResolveEntitySetNameAsync(entityLogicalName, cancellationToken);

    /// <summary>Bridges the report-engine token provider to the canonical token source.</summary>
    private sealed class MetadataTokenSource(IDataverseTokenProvider provider) : IDataverseTokenSource
    {
        private static readonly ReportExecutionContext MetadataContext =
            new() { UserId = Guid.Empty, RoleSetHash = "metadata" };

        public Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
            => provider.GetAccessTokenAsync(MetadataContext, cancellationToken);
    }
}

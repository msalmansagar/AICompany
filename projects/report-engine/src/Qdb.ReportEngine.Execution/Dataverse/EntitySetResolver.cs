using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Resolves entity logical names to Web API entity-set names via <c>EntityDefinitions</c> metadata,
/// caching results (entity-set names are static). Metadata is not user-scoped, so it reads with an
/// app token. Held as a singleton so the cache is shared process-wide.
/// </summary>
public sealed class EntitySetResolver(
    IHttpClientFactory httpClientFactory,
    IDataverseTokenProvider tokenProvider,
    IOptions<DataverseOptions> options) : IEntitySetResolver
{
    private static readonly ReportExecutionContext MetadataContext = new() { UserId = Guid.Empty, RoleSetHash = "metadata" };
    private readonly ConcurrentDictionary<string, string> _cache = new(StringComparer.Ordinal);
    private readonly DataverseOptions _options = options.Value;

    /// <inheritdoc />
    public async Task<string> ResolveAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        if (_cache.TryGetValue(entityLogicalName, out var cached))
        {
            return cached;
        }

        var entitySet = await FetchEntitySetNameAsync(entityLogicalName, cancellationToken).ConfigureAwait(false);
        _cache[entityLogicalName] = entitySet;
        return entitySet;
    }

    private async Task<string> FetchEntitySetNameAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        using var client = await CreateClientAsync(cancellationToken).ConfigureAwait(false);
        var path = $"api/data/{_options.ApiVersion}/EntityDefinitions(LogicalName='{entityLogicalName}')?$select=EntitySetName";

        using var response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var definition = await response.Content
            .ReadFromJsonAsync<EntityDefinitionResponse>(cancellationToken)
            .ConfigureAwait(false);
        if (definition?.EntitySetName is null)
        {
            throw new InvalidOperationException($"EntitySetName not found for entity '{entityLogicalName}'.");
        }

        return definition.EntitySetName;
    }

    private async Task<HttpClient> CreateClientAsync(CancellationToken cancellationToken)
    {
        var token = await tokenProvider.GetAccessTokenAsync(MetadataContext, cancellationToken).ConfigureAwait(false);
        var client = httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(_options.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private sealed record EntityDefinitionResponse(string? EntitySetName);
}

using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Mss.Dataverse;

/// <summary>
/// Web API implementation of the canonical metadata contract (MSS Technologies
/// global library, .NET runtime). Reads Dataverse with a bearer token from the
/// injected <see cref="IDataverseTokenSource"/> — this library does NOT acquire
/// tokens or hold a secret. Entity-set names are cached (they are static).
///
/// A plugin (Org Service SDK) implementation can satisfy the same interface
/// separately; this one is for HttpClient-based middle-tier callers.
/// </summary>
public sealed class DataverseMetadataService : IDataverseMetadata
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDataverseTokenSource _tokenSource;
    private readonly string _baseAddress;
    private readonly string _apiVersion;
    private readonly ConcurrentDictionary<string, string> _entitySetCache = new(StringComparer.Ordinal);

    public DataverseMetadataService(
        IHttpClientFactory httpClientFactory,
        IDataverseTokenSource tokenSource,
        string dataverseUrl,
        string apiVersion = "v9.2")
    {
        _httpClientFactory = httpClientFactory;
        _tokenSource = tokenSource;
        _baseAddress = dataverseUrl.TrimEnd('/') + "/";
        _apiVersion = apiVersion;
    }

    public async Task<string> ResolveEntitySetNameAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        if (_entitySetCache.TryGetValue(entityLogicalName, out var cached))
        {
            return cached;
        }

        var definition = await GetAsync<EntityDefinitionResponse>(
            $"api/data/{_apiVersion}/EntityDefinitions(LogicalName='{entityLogicalName}')?$select=EntitySetName",
            entityLogicalName,
            null,
            cancellationToken).ConfigureAwait(false);

        if (definition?.EntitySetName is null)
        {
            throw new DataverseMetadataException($"EntitySetName not found for entity '{entityLogicalName}'.", entityLogicalName);
        }

        _entitySetCache[entityLogicalName] = definition.EntitySetName;
        return definition.EntitySetName;
    }

    public async Task<IReadOnlyList<FieldMetadata>> GetFieldsAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        var entity = await GetAsync<EntityWithAttributes>(
            $"api/data/{_apiVersion}/EntityDefinitions(LogicalName='{entityLogicalName}')?$expand=Attributes",
            entityLogicalName,
            null,
            cancellationToken).ConfigureAwait(false);

        return (entity?.Attributes ?? [])
            .Select(a => new FieldMetadata(
                a.LogicalName,
                a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
                a.AttributeType ?? "Unknown",
                a.RequiredLevel?.Value == "ApplicationRequired",
                a.IsCustomAttribute ?? false,
                // Web API $expand=Attributes does not include option-sets — use GetOptionsAsync.
                Array.Empty<OptionMetadata>()))
            .ToList();
    }

    public async Task<IReadOnlyList<OptionMetadata>> GetOptionsAsync(
        string entityLogicalName,
        string attributeLogicalName,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        ArgumentException.ThrowIfNullOrEmpty(attributeLogicalName);
        var attribute = await GetAsync<PicklistAttribute>(
            $"api/data/{_apiVersion}/EntityDefinitions(LogicalName='{entityLogicalName}')" +
            $"/Attributes(LogicalName='{attributeLogicalName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet",
            entityLogicalName,
            attributeLogicalName,
            cancellationToken).ConfigureAwait(false);

        return (attribute?.OptionSet?.Options ?? [])
            // Value is the real 100000000-based code — never re-index it.
            .Select(o => new OptionMetadata(o.Value, o.Label?.UserLocalizedLabel?.Label ?? o.Value.ToString()))
            .ToList();
    }

    private async Task<T?> GetAsync<T>(string path, string? entity, string? attribute, CancellationToken cancellationToken)
    {
        using var client = await CreateClientAsync(cancellationToken).ConfigureAwait(false);
        using var response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new DataverseMetadataException(
                $"Metadata read failed ({(int)response.StatusCode}).", entity, attribute);
        }
        return await response.Content.ReadFromJsonAsync<T>(cancellationToken).ConfigureAwait(false);
    }

    private async Task<HttpClient> CreateClientAsync(CancellationToken cancellationToken)
    {
        var token = await _tokenSource.GetAccessTokenAsync(cancellationToken).ConfigureAwait(false);
        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(_baseAddress);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
        client.DefaultRequestHeaders.Add("OData-Version", "4.0");
        return client;
    }

    // --- Web API metadata shapes (only the fields this service reads) ---
    private sealed record EntityDefinitionResponse([property: JsonPropertyName("EntitySetName")] string? EntitySetName);

    private sealed record EntityWithAttributes(
        [property: JsonPropertyName("Attributes")] IReadOnlyList<RawAttribute>? Attributes);

    private sealed record RawAttribute(
        [property: JsonPropertyName("LogicalName")] string LogicalName,
        [property: JsonPropertyName("AttributeType")] string? AttributeType,
        [property: JsonPropertyName("DisplayName")] RawLabelContainer? DisplayName,
        [property: JsonPropertyName("RequiredLevel")] RawRequiredLevel? RequiredLevel,
        [property: JsonPropertyName("IsCustomAttribute")] bool? IsCustomAttribute);

    private sealed record RawRequiredLevel([property: JsonPropertyName("Value")] string? Value);

    private sealed record PicklistAttribute([property: JsonPropertyName("OptionSet")] RawOptionSet? OptionSet);

    private sealed record RawOptionSet([property: JsonPropertyName("Options")] IReadOnlyList<RawOption>? Options);

    private sealed record RawOption(
        [property: JsonPropertyName("Value")] int Value,
        [property: JsonPropertyName("Label")] RawLabelContainer? Label);

    private sealed record RawLabelContainer(
        [property: JsonPropertyName("UserLocalizedLabel")] RawLabel? UserLocalizedLabel);

    private sealed record RawLabel([property: JsonPropertyName("Label")] string? Label);
}

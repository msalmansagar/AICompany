using System.Collections.Concurrent;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using SdkOption = Microsoft.Xrm.Sdk.Metadata.OptionMetadata;

namespace Mss.Dataverse;

/// <summary>
/// Organization Service SDK implementation of the canonical metadata contract
/// (MSS Technologies global library, plugin/.NET Framework runtime). Reads
/// metadata via <see cref="IOrganizationService"/> from the plugin execution
/// context — no token, no HttpClient. The SDK sibling of
/// <c>DataverseMetadataService</c> (Web API); both satisfy the same interface.
///
/// The SDK is synchronous; the async contract is honoured with completed tasks.
/// Entity-set names are cached (they are static).
/// </summary>
public sealed class OrgServiceMetadataService : IDataverseMetadata
{
    private readonly IOrganizationService _service;
    private readonly ConcurrentDictionary<string, string> _entitySetCache =
        new ConcurrentDictionary<string, string>(StringComparer.Ordinal);

    public OrgServiceMetadataService(IOrganizationService service)
    {
        _service = service;
    }

    public Task<string> ResolveEntitySetNameAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(entityLogicalName))
        {
            throw new ArgumentException("entityLogicalName is required", nameof(entityLogicalName));
        }
        if (_entitySetCache.TryGetValue(entityLogicalName, out var cached))
        {
            return Task.FromResult(cached);
        }

        var metadata = Retrieve(entityLogicalName, EntityFilters.Entity);
        var entitySet = metadata.EntitySetName
            ?? throw new DataverseMetadataException($"EntitySetName not found for entity '{entityLogicalName}'.", entityLogicalName);
        _entitySetCache[entityLogicalName] = entitySet;
        return Task.FromResult(entitySet);
    }

    public Task<IReadOnlyList<FieldMetadata>> GetFieldsAsync(string entityLogicalName, CancellationToken cancellationToken)
    {
        var metadata = Retrieve(entityLogicalName, EntityFilters.Attributes);
        var fields = (metadata.Attributes ?? Array.Empty<AttributeMetadata>())
            .Select(a => new FieldMetadata(
                a.LogicalName,
                a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
                a.AttributeType?.ToString() ?? "Unknown",
                a.RequiredLevel?.Value == AttributeRequiredLevel.ApplicationRequired,
                a.IsCustomAttribute ?? false))
            .ToList();
        return Task.FromResult<IReadOnlyList<FieldMetadata>>(fields);
    }

    public Task<IReadOnlyList<OptionMetadata>> GetOptionsAsync(
        string entityLogicalName,
        string attributeLogicalName,
        CancellationToken cancellationToken)
    {
        var metadata = Retrieve(entityLogicalName, EntityFilters.Attributes);
        var attribute = (metadata.Attributes ?? Array.Empty<AttributeMetadata>())
            .FirstOrDefault(a => a.LogicalName == attributeLogicalName);

        var options = new List<OptionMetadata>();
        if (attribute is EnumAttributeMetadata enumAttribute && enumAttribute.OptionSet?.Options != null)
        {
            foreach (SdkOption option in enumAttribute.OptionSet.Options)
            {
                // Value is the real metadata code (100000000-based) — never re-index it.
                options.Add(new OptionMetadata(
                    option.Value ?? 0,
                    option.Label?.UserLocalizedLabel?.Label ?? (option.Value ?? 0).ToString()));
            }
        }
        return Task.FromResult<IReadOnlyList<OptionMetadata>>(options);
    }

    private EntityMetadata Retrieve(string entityLogicalName, EntityFilters filters)
    {
        try
        {
            var response = (RetrieveEntityResponse)_service.Execute(new RetrieveEntityRequest
            {
                LogicalName = entityLogicalName,
                EntityFilters = filters,
                RetrieveAsIfPublished = true,
            });
            return response.EntityMetadata;
        }
        catch (Exception ex) when (ex is not DataverseMetadataException)
        {
            throw new DataverseMetadataException($"Metadata read failed for '{entityLogicalName}'.", entityLogicalName, inner: ex);
        }
    }
}

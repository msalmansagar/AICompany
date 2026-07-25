using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using SdkOption = Microsoft.Xrm.Sdk.Metadata.OptionMetadata;

// Block-scoped namespace + explicit usings, no ImplicitUsings — vendored into
// plugin projects (net462/net471, older LangVersion).
namespace Mss.Dataverse
{
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
            _service = service ?? throw new ArgumentNullException(nameof(service));
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
                    a.IsCustomAttribute ?? false,
                    // The SDK retrieves option-sets inline — include them on the field.
                    ExtractOptions(a)))
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
            return Task.FromResult(ExtractOptions(attribute));
        }

        /// <summary>Option-set values for an attribute, or empty if it has none.</summary>
        private static IReadOnlyList<OptionMetadata> ExtractOptions(AttributeMetadata? attribute)
        {
            if (!(attribute is EnumAttributeMetadata enumAttribute) || enumAttribute.OptionSet?.Options == null)
            {
                return Array.Empty<OptionMetadata>();
            }
            var options = new List<OptionMetadata>();
            foreach (SdkOption option in enumAttribute.OptionSet.Options)
            {
                // Value is the real metadata code (100000000-based) — never re-index it.
                options.Add(new OptionMetadata(
                    option.Value ?? 0,
                    option.Label?.UserLocalizedLabel?.Label ?? (option.Value ?? 0).ToString()));
            }
            return options;
        }

        private EntityMetadata Retrieve(string entityLogicalName, EntityFilters filters)
        {
            try
            {
                var response = (RetrieveEntityResponse)_service.Execute(new RetrieveEntityRequest
                {
                    LogicalName = entityLogicalName,
                    EntityFilters = filters,
                    // Published schema only — matches the Web API impl's default.
                    RetrieveAsIfPublished = false,
                });
                return response.EntityMetadata;
            }
            catch (Exception ex) when (!(ex is DataverseMetadataException))
            {
                throw new DataverseMetadataException($"Metadata read failed for '{entityLogicalName}'.", entityLogicalName, inner: ex);
            }
        }
    }
}

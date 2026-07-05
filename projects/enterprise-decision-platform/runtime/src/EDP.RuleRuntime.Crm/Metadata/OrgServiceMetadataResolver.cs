using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using EDP.RuleRuntime.Metadata;

namespace EDP.RuleRuntime.Crm.Metadata
{
    /// <summary>
    /// Live IMetadataResolver over the Organization Service. Retrieves entity metadata
    /// once per entity (attributes included) and caches it for the lifetime of the
    /// resolver — the plugin/adapter creates one resolver per invocation, so the cache
    /// is request-scoped (sandbox-safe, no shared mutable static state).
    /// </summary>
    public sealed class OrgServiceMetadataResolver : IMetadataResolver
    {
        private readonly IOrganizationService _service;
        private readonly Dictionary<string, EntityMetadata?> _cache =
            new Dictionary<string, EntityMetadata?>(StringComparer.OrdinalIgnoreCase);

        public OrgServiceMetadataResolver(IOrganizationService service)
            => _service = service ?? throw new ArgumentNullException(nameof(service));

        public bool EntityExists(string entityLogicalName) => Load(entityLogicalName) != null;

        public bool TryGetAttribute(string entityLogicalName, string attributeLogicalName, out AttributeInfo attribute)
        {
            attribute = null!;
            var entity = Load(entityLogicalName);
            if (entity?.Attributes == null) return false;

            foreach (var attr in entity.Attributes)
            {
                if (!string.Equals(attr.LogicalName, attributeLogicalName, StringComparison.OrdinalIgnoreCase)) continue;
                if (attr.AttributeType == null) return false;
                attribute = new AttributeInfo(attr.LogicalName, FieldTypeMapper.Map(attr.AttributeType.Value),
                    attr.DisplayName?.UserLocalizedLabel?.Label);
                return true;
            }
            return false;
        }

        public IReadOnlyCollection<int> GetOptionValues(string entityLogicalName, string attributeLogicalName)
        {
            var entity = Load(entityLogicalName);
            if (entity?.Attributes == null) return Array.Empty<int>();

            foreach (var attr in entity.Attributes)
            {
                if (!string.Equals(attr.LogicalName, attributeLogicalName, StringComparison.OrdinalIgnoreCase)) continue;
                if (attr is EnumAttributeMetadata en && en.OptionSet?.Options != null)
                {
                    var values = new List<int>();
                    foreach (var opt in en.OptionSet.Options)
                        if (opt.Value.HasValue) values.Add(opt.Value.Value);
                    return values;
                }
            }
            return Array.Empty<int>();
        }

        private EntityMetadata? Load(string entityLogicalName)
        {
            if (_cache.TryGetValue(entityLogicalName, out var cached)) return cached;

            EntityMetadata? metadata = null;
            try
            {
                var response = (RetrieveEntityResponse)_service.Execute(new RetrieveEntityRequest
                {
                    LogicalName = entityLogicalName,
                    EntityFilters = EntityFilters.Attributes,
                    RetrieveAsIfPublished = false
                });
                metadata = response.EntityMetadata;
            }
            catch (Exception)
            {
                // Unknown entity or metadata error -> treat as "not found"; validation surfaces it.
                metadata = null;
            }

            _cache[entityLogicalName] = metadata;
            return metadata;
        }
    }
}

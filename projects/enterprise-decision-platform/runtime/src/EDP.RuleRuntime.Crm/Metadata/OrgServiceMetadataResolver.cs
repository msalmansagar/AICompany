using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Mss.Dataverse;
using EDP.RuleRuntime.Metadata;

namespace EDP.RuleRuntime.Crm.Metadata
{
    /// <summary>
    /// Live <see cref="IMetadataResolver"/> over the Organization Service. A thin
    /// adapter over the shared <c>Mss.Dataverse.OrgServiceMetadataService</c>
    /// (vendored under ../Global, see GLOBAL-VERSION) — the RetrieveEntityRequest,
    /// attribute reads, and option-set extraction now live in the canonical.
    ///
    /// The resolver is created once per plugin invocation, so its field cache is
    /// request-scoped (sandbox-safe): each entity's fields (with option-sets) are
    /// fetched once and every query is served from that cache.
    /// </summary>
    public sealed class OrgServiceMetadataResolver : IMetadataResolver
    {
        private readonly OrgServiceMetadataService _metadata;
        private readonly Dictionary<string, IReadOnlyList<FieldMetadata>?> _cache =
            new Dictionary<string, IReadOnlyList<FieldMetadata>?>(StringComparer.OrdinalIgnoreCase);

        public OrgServiceMetadataResolver(IOrganizationService service)
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            _metadata = new OrgServiceMetadataService(service);
        }

        public bool EntityExists(string entityLogicalName) => Load(entityLogicalName) != null;

        public bool TryGetAttribute(string entityLogicalName, string attributeLogicalName, out AttributeInfo attribute)
        {
            attribute = null!;
            var field = Find(entityLogicalName, attributeLogicalName);
            if (field == null) return false;

            // The canonical carries the attribute type as its AttributeTypeCode name;
            // parse it back so the existing FieldTypeMapper is reused unchanged. An
            // unmappable/unknown type (e.g. "Unknown") yields false, as before.
            if (!Enum.TryParse<AttributeTypeCode>(field.AttributeType, out var code)) return false;
            attribute = new AttributeInfo(field.LogicalName, FieldTypeMapper.Map(code), field.DisplayName);
            return true;
        }

        public IReadOnlyCollection<int> GetOptionValues(string entityLogicalName, string attributeLogicalName)
        {
            var field = Find(entityLogicalName, attributeLogicalName);
            if (field == null || field.Options.Count == 0) return Array.Empty<int>();
            return field.Options.Select(o => o.Value).ToList();
        }

        private FieldMetadata? Find(string entityLogicalName, string attributeLogicalName)
        {
            var fields = Load(entityLogicalName);
            return fields?.FirstOrDefault(f =>
                string.Equals(f.LogicalName, attributeLogicalName, StringComparison.OrdinalIgnoreCase));
        }

        private IReadOnlyList<FieldMetadata>? Load(string entityLogicalName)
        {
            if (_cache.TryGetValue(entityLogicalName, out var cached)) return cached;

            IReadOnlyList<FieldMetadata>? fields;
            try
            {
                fields = _metadata.GetFieldsAsync(entityLogicalName, default).GetAwaiter().GetResult();
            }
            catch (Exception)
            {
                // Unknown entity or metadata error -> treat as "not found"; validation surfaces it.
                fields = null;
            }

            _cache[entityLogicalName] = fields;
            return fields;
        }
    }
}

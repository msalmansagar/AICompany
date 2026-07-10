using System.Collections.Generic;

namespace EDP.RuleRuntime.Metadata
{
    /// <summary>
    /// In-memory metadata for tests and the local Test Rule harness. Populate it
    /// with the entities/attributes a PCRM fixture references, then compile and
    /// execute with no live CRM connection.
    /// </summary>
    public sealed class InMemoryMetadataResolver : IMetadataResolver
    {
        private readonly Dictionary<string, Dictionary<string, AttributeInfo>> _entities =
            new Dictionary<string, Dictionary<string, AttributeInfo>>(System.StringComparer.OrdinalIgnoreCase);

        private readonly Dictionary<string, HashSet<int>> _optionValues =
            new Dictionary<string, HashSet<int>>(System.StringComparer.OrdinalIgnoreCase);

        public InMemoryMetadataResolver AddAttribute(string entity, string attribute, FieldType type, string? displayName = null)
        {
            if (!_entities.TryGetValue(entity, out var attrs))
            {
                attrs = new Dictionary<string, AttributeInfo>(System.StringComparer.OrdinalIgnoreCase);
                _entities[entity] = attrs;
            }
            attrs[attribute] = new AttributeInfo(attribute, type, displayName);
            return this;
        }

        public InMemoryMetadataResolver AddOptionValues(string entity, string attribute, params int[] values)
        {
            _optionValues[Key(entity, attribute)] = new HashSet<int>(values);
            return this;
        }

        public bool TryGetAttribute(string entityLogicalName, string attributeLogicalName, out AttributeInfo attribute)
        {
            attribute = null!;
            return _entities.TryGetValue(entityLogicalName, out var attrs)
                   && attrs.TryGetValue(attributeLogicalName, out attribute!);
        }

        public bool EntityExists(string entityLogicalName) => _entities.ContainsKey(entityLogicalName);

        public IReadOnlyCollection<int> GetOptionValues(string entityLogicalName, string attributeLogicalName)
            => _optionValues.TryGetValue(Key(entityLogicalName, attributeLogicalName), out var v)
                ? (IReadOnlyCollection<int>)v
                : System.Array.Empty<int>();

        private static string Key(string entity, string attribute) => entity + "|" + attribute;
    }
}

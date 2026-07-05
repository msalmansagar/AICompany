using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// Minimal in-memory IOrganizationService for adapter tests — no CRM required.
    /// Supports Create (captured), Retrieve (from a seeded map), and Execute for
    /// RetrieveEntityRequest (from seeded metadata).
    /// </summary>
    public sealed class FakeOrganizationService : IOrganizationService
    {
        public readonly List<Entity> Created = new List<Entity>();
        public readonly List<Entity> Updated = new List<Entity>();
        public readonly Dictionary<string, Entity> RetrieveResults = new Dictionary<string, Entity>(StringComparer.OrdinalIgnoreCase);
        public readonly Dictionary<string, EntityMetadata> Metadata = new Dictionary<string, EntityMetadata>(StringComparer.OrdinalIgnoreCase);
        public bool ThrowOnCreate;

        public Guid Create(Entity entity)
        {
            if (ThrowOnCreate) throw new InvalidOperationException("Simulated throttle / create failure.");
            Created.Add(entity);
            return Guid.NewGuid();
        }

        public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
            => RetrieveResults.TryGetValue(entityName, out var e)
                ? e
                : throw new InvalidOperationException($"No seeded record for '{entityName}'.");

        public OrganizationResponse Execute(OrganizationRequest request)
        {
            if (request is RetrieveEntityRequest re)
            {
                if (!Metadata.TryGetValue(re.LogicalName, out var md))
                    throw new InvalidOperationException($"No seeded metadata for '{re.LogicalName}'.");
                return new RetrieveEntityResponse { Results = new ParameterCollection { { "EntityMetadata", md } } };
            }
            throw new NotImplementedException($"Fake does not handle {request.RequestName}.");
        }

        // ---- unused members ----
        public void Update(Entity entity) => Updated.Add(entity);
        public void Delete(string entityName, Guid id) => throw new NotImplementedException();
        public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
        public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            // Return created records of the queried entity (adequate for governance tests).
            var entityName = (query as QueryExpression)?.EntityName;
            var matches = entityName == null ? new List<Entity>() : Created.Where(e => e.LogicalName == entityName).ToList();
            return new EntityCollection(matches);
        }

        // ---- test metadata builder ----
        public static EntityMetadata BuildEntity(string logicalName, params AttributeMetadata[] attributes)
        {
            var md = new EntityMetadata();
            SetProp(md, nameof(EntityMetadata.LogicalName), logicalName);
            SetProp(md, nameof(EntityMetadata.Attributes), attributes);
            return md;
        }

        public static AttributeMetadata Attr<T>(string logicalName) where T : AttributeMetadata, new()
        {
            var a = new T();
            SetProp(a, nameof(AttributeMetadata.LogicalName), logicalName);
            return a;
        }

        private static void SetProp(object target, string propertyName, object? value)
        {
            var prop = target.GetType().GetProperty(propertyName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            var setter = prop?.GetSetMethod(true);
            if (setter != null) { setter.Invoke(target, new[] { value }); return; }
            // fall back to backing field
            var field = target.GetType().GetField($"_{char.ToLowerInvariant(propertyName[0])}{propertyName.Substring(1)}",
                BindingFlags.Instance | BindingFlags.NonPublic);
            field?.SetValue(target, value);
        }
    }
}

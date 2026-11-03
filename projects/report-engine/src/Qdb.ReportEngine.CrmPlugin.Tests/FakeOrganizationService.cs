using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// Serves environment-variable lookups from a dictionary keyed by schema name, so a test can
    /// exercise the real <c>PluginConfiguration.Load</c> path rather than a shortcut around it.
    /// Every other operation throws: the plugin is not supposed to perform any, and a silent stub
    /// would let a regression that starts writing data pass unnoticed.
    /// </summary>
    internal sealed class FakeOrganizationService : IOrganizationService
    {
        private readonly IDictionary<string, string> _variables;

        public FakeOrganizationService(IDictionary<string, string> variables) => _variables = variables;

        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            var schemaName = ReadRequestedSchemaName((QueryExpression)query);
            var result = new EntityCollection();

            if (schemaName != null && _variables.TryGetValue(schemaName, out var value))
            {
                var row = new Entity("environmentvariablevalue");
                row["value"] = value;
                result.Entities.Add(row);
            }

            return result;
        }

        private static string ReadRequestedSchemaName(QueryExpression query) => query.LinkEntities
            .SelectMany(link => link.LinkCriteria.Conditions)
            .Where(condition => condition.AttributeName == "schemaname")
            .Select(condition => condition.Values.FirstOrDefault() as string)
            .FirstOrDefault();

        public Guid Create(Entity entity) => throw new NotSupportedException();

        public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();

        public void Update(Entity entity) => throw new NotSupportedException();

        public void Delete(string entityName, Guid id) => throw new NotSupportedException();

        public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();

        public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
            throw new NotSupportedException();

        public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
            throw new NotSupportedException();
    }
}

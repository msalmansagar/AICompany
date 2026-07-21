using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// ADR-14 / ADR-12 layer 1: a production pin must carry a justification code + note,
    /// enforced at the platform boundary for every write path. Enforced only in production.
    /// </summary>
    public sealed class ProductionPinJustificationPluginTests
    {
        private const string Entity = "qdb_edp_ruleversion";

        [Fact]
        public void Create_pinned_without_justification_in_production_is_rejected()
        {
            var target = new Entity(Entity) { ["qdb_edp_ispinned"] = true };
            Assert.Throws<InvalidPluginExecutionException>(() => Run("Create", target, pre: null, prodFlag: "yes"));
        }

        [Fact]
        public void Create_pinned_with_code_and_note_in_production_is_allowed()
        {
            var target = new Entity(Entity)
            {
                ["qdb_edp_ispinned"] = true,
                ["qdb_edp_pinjustificationcode"] = new OptionSetValue(100000000),
                ["qdb_edp_pinjustificationnote"] = "Regulatory freeze for FY-end.",
            };
            Run("Create", target, pre: null, prodFlag: "yes"); // no throw
        }

        [Fact]
        public void Update_to_pinned_without_justification_in_production_is_rejected()
        {
            var pre = new Entity(Entity) { ["qdb_edp_ispinned"] = false };
            var target = new Entity(Entity) { ["qdb_edp_ispinned"] = true };
            Assert.Throws<InvalidPluginExecutionException>(() => Run("Update", target, pre, prodFlag: "yes"));
        }

        [Fact]
        public void Update_clearing_note_while_pinned_in_production_is_rejected()
        {
            var pre = new Entity(Entity)
            {
                ["qdb_edp_ispinned"] = true,
                ["qdb_edp_pinjustificationcode"] = new OptionSetValue(100000000),
                ["qdb_edp_pinjustificationnote"] = "was justified",
            };
            var target = new Entity(Entity) { ["qdb_edp_pinjustificationnote"] = "   " };
            Assert.Throws<InvalidPluginExecutionException>(() => Run("Update", target, pre, prodFlag: "yes"));
        }

        [Fact]
        public void Non_pin_update_keeps_justification_from_preimage_and_is_allowed()
        {
            var pre = new Entity(Entity)
            {
                ["qdb_edp_ispinned"] = true,
                ["qdb_edp_pinjustificationcode"] = new OptionSetValue(100000000),
                ["qdb_edp_pinjustificationnote"] = "already justified",
            };
            var target = new Entity(Entity) { ["qdb_edp_versionnumber"] = 3 };
            Run("Update", target, pre, prodFlag: "yes"); // pinned stays true, code+note from pre → no throw
        }

        [Fact]
        public void Unpinning_never_requires_justification()
        {
            var pre = new Entity(Entity) { ["qdb_edp_ispinned"] = true };
            var target = new Entity(Entity) { ["qdb_edp_ispinned"] = false };
            Run("Update", target, pre, prodFlag: "yes"); // no throw
        }

        [Theory]
        [InlineData("no")]
        [InlineData(null)]
        public void Non_production_skips_enforcement(string? prodFlag)
        {
            var target = new Entity(Entity) { ["qdb_edp_ispinned"] = true };
            Run("Create", target, pre: null, prodFlag); // no throw even without justification
        }

        private static void Run(string message, Entity target, Entity? pre, string? prodFlag)
        {
            var ctx = new FakePluginContext { MessageName = message, PrimaryEntityName = Entity, Stage = 20 };
            ctx.InputParameters["Target"] = target;
            if (pre != null) ctx.PreEntityImages["PreImage"] = pre;
            var provider = new FakeServiceProvider(ctx, new EnvFlagService(prodFlag));
            new ProductionPinJustificationPlugin().Execute(provider);
        }

        [Fact]
        public void Production_flag_unreadable_fails_safe_and_enforces()
        {
            // QA-C2: if the env-var query throws, IsProduction() must fail SAFE (treat as production)
            // and still reject an unjustified pin — never silently skip enforcement.
            var target = new Entity(Entity) { ["qdb_edp_ispinned"] = true };
            var ctx = new FakePluginContext { MessageName = "Create", PrimaryEntityName = Entity, Stage = 20 };
            ctx.InputParameters["Target"] = target;
            var provider = new FakeServiceProvider(ctx, new ThrowingService());
            Assert.Throws<InvalidPluginExecutionException>(() => new ProductionPinJustificationPlugin().Execute(provider));
        }

        /// <summary>Org service whose flag query throws — exercises the IsProduction() fail-safe path.</summary>
        private sealed class ThrowingService : IOrganizationService
        {
            public EntityCollection RetrieveMultiple(QueryBase query) => throw new InvalidOperationException("production flag unreadable");
            public Guid Create(Entity entity) => throw new NotImplementedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotImplementedException();
            public void Update(Entity entity) => throw new NotImplementedException();
            public void Delete(string entityName, Guid id) => throw new NotImplementedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotImplementedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
        }

        /// <summary>Minimal org service that answers only the production-flag query.</summary>
        private sealed class EnvFlagService : IOrganizationService
        {
            private readonly string? _value;
            public EnvFlagService(string? value) => _value = value;

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var result = new EntityCollection();
                if (_value != null)
                {
                    var row = new Entity("environmentvariablevalue");
                    row["value"] = _value;
                    result.Entities.Add(row);
                }
                return result;
            }

            public Guid Create(Entity entity) => throw new NotImplementedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotImplementedException();
            public void Update(Entity entity) => throw new NotImplementedException();
            public void Delete(string entityName, Guid id) => throw new NotImplementedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotImplementedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotImplementedException();
        }
    }
}

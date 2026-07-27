using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>F-07: deleting a rule or version writes an append-only audit entry.</summary>
    public class DeleteAuditTests
    {
        [Theory]
        [InlineData("qdb_edp_rule")]
        [InlineData("qdb_edp_ruleversion")]
        public void Delete_writes_an_audit_record(string entity)
        {
            var fake = new FakeOrganizationService();
            var ctx = new FakePluginContext { MessageName = "Delete" };
            var id = Guid.NewGuid();
            ctx.InputParameters["Target"] = new EntityReference(entity, id);

            new DeleteAuditPlugin().Execute(new FakeServiceProvider(ctx, fake));

            var audit = Assert.Single(fake.Created, e => e.LogicalName == "qdb_edp_ruleaudit");
            Assert.Equal("Deleted", audit.GetAttributeValue<string>("qdb_edp_action"));
            Assert.Contains(entity, audit.GetAttributeValue<string>("qdb_edp_details"));
            Assert.Contains(id.ToString(), audit.GetAttributeValue<string>("qdb_edp_details"));
            // F-06: actor recorded as a systemuser lookup, not just a string
            var actor = audit.GetAttributeValue<EntityReference>("qdb_edp_actorid");
            Assert.Equal("systemuser", actor.LogicalName);
        }

        [Fact]
        public void No_target_is_a_no_op()
        {
            var fake = new FakeOrganizationService();
            new DeleteAuditPlugin().Execute(new FakeServiceProvider(new FakePluginContext { MessageName = "Delete" }, fake));
            Assert.Empty(fake.Created);
        }
    }
}

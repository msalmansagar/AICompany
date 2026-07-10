using System;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm.Governance;
using EDP.RuleRuntime.Crm.Sinks;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>The regression gate blocks Publish when saved scenarios fail, and is inert otherwise.</summary>
    public class GovernancePublishGateTests
    {
        private const int Approved = 100000002, Published = 100000003;

        private sealed class StubGate : IPublishGate
        {
            private readonly PublishGateResult _result;
            public StubGate(PublishGateResult result) => _result = result;
            public PublishGateResult Check(Guid ruleVersionId) => _result;
        }

        private static (FakeOrganizationService fake, Guid id) ApprovedVersion()
        {
            var fake = new FakeOrganizationService();
            var id = Guid.NewGuid();
            fake.RetrieveResults["qdb_edp_ruleversion"] = new Entity("qdb_edp_ruleversion", id)
            {
                ["qdb_edp_lifecyclestate"] = new OptionSetValue(Approved)
            };
            return (fake, id);
        }

        [Fact]
        public void Publish_is_blocked_when_the_gate_fails_and_nothing_is_written()
        {
            var (fake, id) = ApprovedVersion();
            var gov = new GovernanceService(fake, new DataverseAuditSink(fake),
                new StubGate(PublishGateResult.Block("2 of 3 saved scenarios failed")));

            var ex = Assert.Throws<InvalidOperationException>(() => gov.PerformAction(id, "Publish", null, Guid.NewGuid()));

            Assert.Contains("scenarios failed", ex.Message);
            Assert.Empty(fake.Updated); // gate runs before the state touch — no transition
            Assert.DoesNotContain(fake.Created, e => e.LogicalName == "qdb_edp_ruleaudit");
        }

        [Fact]
        public void Publish_proceeds_when_the_gate_passes()
        {
            var (fake, id) = ApprovedVersion();
            var gov = new GovernanceService(fake, new DataverseAuditSink(fake),
                new StubGate(PublishGateResult.Pass("3/3 scenarios passed")));

            var r = gov.PerformAction(id, "Publish", null, Guid.NewGuid());

            Assert.True(r.Success);
            Assert.Equal(Published, fake.Updated[0].GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate").Value);
        }
    }
}

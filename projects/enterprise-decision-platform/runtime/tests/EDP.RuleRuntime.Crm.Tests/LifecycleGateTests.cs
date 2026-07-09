using System;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// F-01 governance gate: execution paths must only resolve a PUBLISHED rule version;
    /// Validate/Test may resolve a Draft.
    /// </summary>
    public class LifecycleGateTests
    {
        private const int Draft = 100000000;
        private const int Published = 100000003;

        private sealed class NoTrace : ITraceSink { public void WriteTrace(TraceRecord trace) { } }
        private static RuleDecisionService Svc(IOrganizationService s) => new RuleDecisionService(s, new InMemoryMetadataResolver(), new NoTrace());

        private static FakeOrganizationService WithVersion(Guid id, int state)
        {
            var fake = new FakeOrganizationService();
            var v = new Entity("qdb_edp_ruleversion", id);
            v["qdb_edp_pcrmjson"] = "{\"name\":\"x\"}";
            v["qdb_edp_lifecyclestate"] = new OptionSetValue(state);
            fake.RetrieveById[id] = v;
            return fake;
        }

        [Fact]
        public void Published_version_resolves_for_execution()
        {
            var id = Guid.NewGuid();
            Assert.Contains("\"name\"", Svc(WithVersion(id, Published)).ResolvePcrm(id));
        }

        [Fact]
        public void Draft_version_is_blocked_from_execution()
        {
            var id = Guid.NewGuid();
            Assert.Throws<InvalidOperationException>(() => Svc(WithVersion(id, Draft)).ResolvePcrm(id));
        }

        [Fact]
        public void Draft_version_resolves_when_not_requiring_published()
        {
            var id = Guid.NewGuid();
            Assert.Contains("\"name\"", Svc(WithVersion(id, Draft)).ResolvePcrm(id, requirePublished: false));
        }
    }
}

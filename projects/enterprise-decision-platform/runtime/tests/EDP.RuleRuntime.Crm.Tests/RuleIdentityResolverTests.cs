using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm.Identity;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// ADR-21 / FR-B3-06..08, FR-B3-13, TC-2 "conflicting identifiers": one resolver, fixed
    /// precedence, EDP070 on disagreement, EDP071 on a malformed key, deterministic names.
    /// </summary>
    public class RuleIdentityResolverTests
    {
        private static readonly Guid Earliest = Guid.Parse("00000000-0000-0000-0000-00000000000a");
        private static readonly Guid Later = Guid.Parse("00000000-0000-0000-0000-00000000000b");
        private static readonly Guid Other = Guid.Parse("00000000-0000-0000-0000-00000000000c");
        private static readonly Guid VersionOfOther = Guid.Parse("00000000-0000-0000-0000-0000000000f1");

        private static Entity Rule(Guid id, string name, string? key, DateTime createdOn)
            => new Entity("qdb_edp_rule", id) { ["qdb_edp_rulename"] = name, ["qdb_edp_rulekey"] = key, ["createdon"] = createdOn };

        /// <summary>Two rules share a display name; the later one is seeded first to prove ordering is ours.</summary>
        private static FakeOrganizationService Org()
        {
            var fake = new FakeOrganizationService();
            var later = Rule(Later, "All Node Types — Sample", "sample.all-node-types.2", new DateTime(2026, 7, 4, 14, 0, 0, DateTimeKind.Utc));
            var earliest = Rule(Earliest, "All Node Types — Sample", "sample.all-node-types.1", new DateTime(2026, 7, 4, 2, 0, 0, DateTimeKind.Utc));
            var other = Rule(Other, "Demo — Risk Tier (AND/OR)", "demo.risk-tier", new DateTime(2026, 7, 12, 10, 0, 0, DateTimeKind.Utc));
            fake.QueryResults["qdb_edp_rule"] = new List<Entity> { later, other, earliest };
            fake.RetrieveById[Earliest] = earliest;
            fake.RetrieveById[Later] = later;
            fake.RetrieveById[Other] = other;
            fake.RetrieveById[VersionOfOther] = new Entity("qdb_edp_ruleversion", VersionOfOther)
            {
                ["qdb_edp_ruleid"] = new EntityReference("qdb_edp_rule", Other)
            };
            return fake;
        }

        private static RuleIdentity Resolve(RuleIdentityRequest request) => new RuleIdentityResolver(Org()).Resolve(request);

        private static string Refusal(RuleIdentityRequest request)
            => Assert.Throws<InvalidPluginExecutionException>(() => Resolve(request)).Message;

        [Fact]
        public void Resolve_ByKey_ReturnsTheKeyedRule()
            => Assert.Equal(Other, Resolve(new RuleIdentityRequest { RuleKey = "demo.risk-tier" }).RuleId);

        [Fact]
        public void Resolve_ByVersion_ReturnsItsRuleAndKey()
            => Assert.Equal("demo.risk-tier", Resolve(new RuleIdentityRequest { RuleVersionId = VersionOfOther }).RuleKey);

        [Fact]
        public void Resolve_DuplicateName_PicksTheEarliestCreated()
            => Assert.Equal(Earliest, Resolve(new RuleIdentityRequest { RuleName = "All Node Types — Sample" }).RuleId);

        [Fact]
        public void Resolve_DuplicateName_ReportsAmbiguityAndCount()
        {
            var identity = Resolve(new RuleIdentityRequest { RuleName = "All Node Types — Sample" });
            Assert.Equal((true, 2), (identity.NameIsAmbiguous, identity.NameMatchCount));
        }

        [Fact]
        public void Resolve_UniqueName_IsNotAmbiguous()
            => Assert.False(Resolve(new RuleIdentityRequest { RuleName = "Demo — Risk Tier (AND/OR)" }).NameIsAmbiguous);

        [Fact]
        public void Resolve_ById_DoesNotReportNameAmbiguity()
            => Assert.Equal(0, Resolve(new RuleIdentityRequest { RuleId = Earliest }).NameMatchCount);

        [Fact]
        public void Resolve_AgreeingIdentifiers_Succeed()
            => Assert.Equal(Other, Resolve(new RuleIdentityRequest { RuleVersionId = VersionOfOther, RuleId = Other, RuleKey = "demo.risk-tier", RuleName = "demo — risk tier (and/or)" }).RuleId);

        [Fact]
        public void Resolve_VersionAndIdDisagree_IsRefusedWithEdp070()
            => Assert.StartsWith("EDP070", Refusal(new RuleIdentityRequest { RuleVersionId = VersionOfOther, RuleId = Earliest }));

        [Fact]
        public void Resolve_IdAndKeyDisagree_IsRefusedWithEdp070()
            => Assert.StartsWith("EDP070", Refusal(new RuleIdentityRequest { RuleId = Earliest, RuleKey = "demo.risk-tier" }));

        [Fact]
        public void Resolve_KeyAndNameDisagree_IsRefusedWithEdp070()
            => Assert.StartsWith("EDP070", Refusal(new RuleIdentityRequest { RuleKey = "demo.risk-tier", RuleName = "All Node Types — Sample" }));

        [Theory]
        [InlineData("Demo.Risk-Tier")]
        [InlineData("ab")]
        [InlineData("demo..risk")]
        [InlineData("demo risk")]
        [InlineData("-demo")]
        public void Resolve_MalformedKey_IsRefusedWithEdp071(string ruleKey)
            => Assert.StartsWith("EDP071", Refusal(new RuleIdentityRequest { RuleKey = ruleKey }));

        [Fact]
        public void Resolve_UnknownKey_IsRefused()
            => Assert.Contains("No rule has RuleKey", Refusal(new RuleIdentityRequest { RuleKey = "unknown.rule" }));

        [Fact]
        public void Resolve_UnknownName_IsRefused()
            => Assert.Contains("No rule is named", Refusal(new RuleIdentityRequest { RuleName = "Nope" }));

        [Fact]
        public void Resolve_NoIdentifier_IsRefused()
            => Assert.Contains("Provide RuleVersionId, RuleId, RuleKey, or RuleName", Refusal(new RuleIdentityRequest()));

        [Fact]
        public void Resolve_KeyHeldByTwoRules_IsRefusedRatherThanGuessed()
        {
            var fake = Org();
            fake.QueryResults["qdb_edp_rule"].Add(Rule(Guid.NewGuid(), "Copy", "demo.risk-tier", DateTime.UtcNow));
            var message = Assert.Throws<InvalidPluginExecutionException>(
                () => new RuleIdentityResolver(fake).Resolve(new RuleIdentityRequest { RuleKey = "demo.risk-tier" })).Message;
            Assert.Contains("not yet unique", message);
        }
    }
}

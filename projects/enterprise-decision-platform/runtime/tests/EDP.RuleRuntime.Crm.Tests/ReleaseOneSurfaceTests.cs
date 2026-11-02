using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// The additive Release 1 fields on the metadata and service surfaces: FR-B1-06, FR-B2-11
    /// (input schema), FR-B3-06/09 (RuleKey in and out), FR-B1-03 (a declared fact fed by an
    /// upstream rule in a set), FR-B2-08 (members validated against the pipeline context).
    /// </summary>
    public class ReleaseOneSurfaceTests
    {
        private const int Published = 100000003;
        private static readonly Guid TierRuleId = Guid.NewGuid();
        private static readonly Guid TierVersionId = Guid.NewGuid();
        private static readonly Guid PricingRuleId = Guid.NewGuid();
        private static readonly Guid PricingVersionId = Guid.NewGuid();

        // Upstream: emits 'tier'. Downstream: a strict rule declaring 'tier' as a required fact.
        private const string TierRule = """
        { "name": "Tier", "inputs": [ { "name": "score", "type": "WholeNumber" } ], "outputs": [ { "name": "tier", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "score", "operator": "GreaterThanOrEqual", "value": 700 } ] }, "then": { "tier": "A" } } ],
            "otherwise": { "tier": "B" } } }
        """;

        private const string PricingRule = """
        { "schemaVersion": "1.1", "inputContract": "strict", "name": "Pricing",
          "inputs": [
            { "name": "tier", "type": "Text", "required": true, "nullable": false, "source": "declared" },
            { "name": "region", "type": "Text", "binding": "address1_stateorprovince" }
          ],
          "outputs": [ { "name": "rate", "type": "Decimal" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "tier", "operator": "Equals", "value": "A" } ] }, "then": { "rate": 0.05 } } ],
            "otherwise": { "rate": 0.09 } } }
        """;

        private static Entity Version(Guid versionId, Guid ruleId, string pcrm, int number) => new Entity("qdb_edp_ruleversion", versionId)
        {
            ["qdb_edp_pcrmjson"] = pcrm,
            ["qdb_edp_lifecyclestate"] = new OptionSetValue(Published),
            ["qdb_edp_ruleid"] = new EntityReference("qdb_edp_rule", ruleId),
            ["qdb_edp_versionnumber"] = number,
            ["qdb_edp_ispinned"] = false,
        };

        private static FakeOrganizationService Org()
        {
            var fake = new FakeOrganizationService();
            var pricing = Version(PricingVersionId, PricingRuleId, PricingRule, 2);
            fake.RetrieveById[TierVersionId] = Version(TierVersionId, TierRuleId, TierRule, 1);
            fake.RetrieveById[PricingVersionId] = pricing;
            fake.RetrieveById[TierRuleId] = new Entity("qdb_edp_rule", TierRuleId) { ["qdb_edp_rulename"] = "Tier", ["qdb_edp_rulekey"] = "demo.tier" };
            var pricingRule = new Entity("qdb_edp_rule", PricingRuleId)
            {
                ["qdb_edp_rulename"] = "Pricing", ["qdb_edp_rulekey"] = "demo.pricing", ["createdon"] = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc)
            };
            fake.RetrieveById[PricingRuleId] = pricingRule;
            fake.QueryResults["qdb_edp_rule"] = new List<Entity> { pricingRule };
            fake.QueryResults["qdb_edp_ruleversion"] = new List<Entity> { pricing };
            return fake;
        }

        private static JsonElement Invoke(IPlugin plugin, string message, params (string Name, object Value)[] inputs)
        {
            var context = new FakePluginContext { MessageName = message };
            foreach (var (name, value) in inputs) context.InputParameters[name] = value;
            plugin.Execute(new FakeServiceProvider(context, Org()));
            return JsonDocument.Parse((string)context.OutputParameters["ResultJson"]).RootElement;
        }

        private static JsonElement InputNamed(JsonElement schema, string name)
            => schema.GetProperty("inputs").EnumerateArray().Single(i => i.GetProperty("name").GetString() == name);

        [Fact]
        public void GetInputSchema_DeclaredFact_HasKindDeclaredAndNoBinding()
        {
            var tier = InputNamed(Invoke(new RuleMetadataPlugin(), "qdb_edp_GetInputSchema", ("RuleVersionId", PricingVersionId.ToString())), "tier");
            Assert.Equal(("declared", JsonValueKind.Null), (tier.GetProperty("kind").GetString(), tier.GetProperty("binding").ValueKind));
        }

        [Fact]
        public void GetInputSchema_BoundInput_KeepsItsBinding()
        {
            var region = InputNamed(Invoke(new RuleMetadataPlugin(), "qdb_edp_GetInputSchema", ("RuleVersionId", PricingVersionId.ToString())), "region");
            Assert.Equal(("bound", "address1_stateorprovince"), (region.GetProperty("kind").GetString(), region.GetProperty("binding").GetString()));
        }

        [Fact]
        public void GetInputSchema_ReportsRequiredNullableAndContract()
        {
            var schema = Invoke(new RuleMetadataPlugin(), "qdb_edp_GetInputSchema", ("RuleVersionId", PricingVersionId.ToString()));
            var tier = InputNamed(schema, "tier");
            Assert.Equal(("strict", "1.1", true, false),
                (schema.GetProperty("inputContract").GetString(), schema.GetProperty("schemaVersion").GetString(),
                 tier.GetProperty("required").GetBoolean(), tier.GetProperty("nullable").GetBoolean()));
        }

        [Fact]
        public void GetInputSchema_LegacyRule_IsLenient()
            => Assert.Equal("lenient", Invoke(new RuleMetadataPlugin(), "qdb_edp_GetInputSchema", ("RuleVersionId", TierVersionId.ToString())).GetProperty("inputContract").GetString());

        [Fact]
        public void GetPublishedVersion_ByRuleKey_ResolvesAndEchoesTheKey()
        {
            var result = Invoke(new RuleMetadataPlugin(), "qdb_edp_GetPublishedVersion", ("RuleKey", "demo.pricing"));
            Assert.Equal((PricingVersionId.ToString(), "demo.pricing"), (result.GetProperty("ruleVersionId").GetString(), result.GetProperty("ruleKey").GetString()));
        }

        [Fact]
        public void GetRuleMetadata_ByName_ReportsAmbiguityFields()
        {
            var result = Invoke(new RuleMetadataPlugin(), "qdb_edp_GetRuleMetadata", ("RuleName", "Pricing"));
            Assert.Equal((false, 1), (result.GetProperty("nameIsAmbiguous").GetBoolean(), result.GetProperty("matchCount").GetInt32()));
        }

        [Fact]
        public void GetRuleHistory_ByRuleKey_EchoesTheKey()
            => Assert.Equal("demo.pricing", Invoke(new RuleServicePlugin(), "qdb_edp_GetRuleHistory", ("RuleKey", "demo.pricing")).GetProperty("ruleKey").GetString());

        [Fact]
        public void ResolveEffectiveVersion_ByRuleKey_ReturnsIdentityWithoutContentHash()
        {
            var result = Invoke(new RuleServicePlugin(), "qdb_edp_ResolveEffectiveVersion", ("RuleKey", "demo.pricing"));
            Assert.Equal(("demo.pricing", false), (result.GetProperty("ruleKey").GetString(), result.TryGetProperty("contentHash", out _)));
        }

        [Fact]
        public void ExecuteRuleSet_UpstreamOutput_SuppliesTheDownstreamDeclaredFact()
        {
            var result = Invoke(new RuleServicePlugin(), "qdb_edp_ExecuteRuleSet",
                ("RuleVersionIdsJson", JsonSerializer.Serialize(new[] { TierVersionId.ToString(), PricingVersionId.ToString() })),
                ("InputsJson", "{\"score\":720}"));
            var pricing = result.GetProperty("results")[1];
            Assert.Equal(("MATCHED", 0.05m), (pricing.GetProperty("outcome").GetString(), pricing.GetProperty("outputs").GetProperty("rate").GetDecimal()));
        }

        [Fact]
        public void ExecuteRuleSet_MissingUpstream_RejectsTheStrictMember()
        {
            var result = Invoke(new RuleServicePlugin(), "qdb_edp_ExecuteRuleSet",
                ("RuleVersionIdsJson", JsonSerializer.Serialize(new[] { PricingVersionId.ToString() })),
                ("InputsJson", "{\"score\":720}"));
            Assert.Equal("INPUT_REJECTED", result.GetProperty("results")[0].GetProperty("outcome").GetString());
        }

        [Fact]
        public void TestRule_ReportsOutcome()
            => Assert.Equal("MATCHED", Invoke(new RuleServicePlugin(), "qdb_edp_TestRule",
                ("PcrmJson", PricingRule), ("InputsJson", "{\"tier\":\"A\"}")).GetProperty("outcome").GetString());
    }
}

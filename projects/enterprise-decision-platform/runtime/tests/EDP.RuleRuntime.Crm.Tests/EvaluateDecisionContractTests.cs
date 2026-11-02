using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Hashing;
using EDP.RuleRuntime.Inputs;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// FR-B2-06 (Outcome), FR-B4-01..03 (CorrelationId, provenance, ContentHash) at the
    /// EvaluateDecision boundary, and the Option A number parsing of InputsJson.
    /// </summary>
    public class EvaluateDecisionContractTests
    {
        private const string StrictRule = """
        { "schemaVersion": "1.1", "inputContract": "strict", "name": "Strict",
          "inputs": [ { "name": "amount", "type": "Decimal", "required": true, "nullable": false } ],
          "outputs": [ { "name": "decision", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "amount", "operator": "GreaterThanOrEqual", "value": 1000 } ] }, "then": { "decision": "approve" } } ] } }
        """;

        private static FakePluginContext Invoke(FakeOrganizationService fake, params (string Name, object Value)[] inputs)
        {
            var context = new FakePluginContext { MessageName = "qdb_edp_EvaluateDecision" };
            foreach (var (name, value) in inputs) context.InputParameters[name] = value;
            new EvaluateDecisionPlugin().Execute(new FakeServiceProvider(context, fake));
            return context;
        }

        private static FakePluginContext AdHoc(string inputsJson, params (string Name, object Value)[] extra)
        {
            var inputs = new List<(string, object)> { ("PcrmJson", StrictRule), ("InputsJson", inputsJson) };
            inputs.AddRange(extra);
            return Invoke(new FakeOrganizationService(), inputs.ToArray());
        }

        private static JsonElement Provenance(FakePluginContext context)
            => JsonDocument.Parse((string)context.OutputParameters["ProvenanceJson"]).RootElement;

        [Fact]
        public void Execute_MatchingInput_ReportsMatched()
            => Assert.Equal("MATCHED", AdHoc("{\"amount\":5000}").OutputParameters["Outcome"]);

        [Fact]
        public void Execute_NonMatchingInput_ReportsNoMatch()
            => Assert.Equal("NO_MATCH", AdHoc("{\"amount\":5}").OutputParameters["Outcome"]);

        [Fact]
        public void Execute_QuotedNumber_IsARejectedResultNotAFault()
        {
            var context = AdHoc("{\"amount\":\"5000\"}");
            Assert.Equal(("INPUT_REJECTED", false, false),
                ((string)context.OutputParameters["Outcome"], (bool)context.OutputParameters["Success"], (bool)context.OutputParameters["Matched"]));
        }

        [Fact]
        public void Execute_RejectedInput_ReportsTheCodeAndTheInput()
        {
            var diagnostics = (string)AdHoc("{\"amount\":\"5000\"}").OutputParameters["DiagnosticsJson"];
            Assert.Contains("\"code\":\"EDP062\"", diagnostics);
            Assert.Contains("\"location\":\"amount\"", diagnostics);
        }

        [Fact]
        public void Execute_MalformedInputsJson_IsAFault()
            => Assert.Throws<InvalidPluginExecutionException>(() => AdHoc("{not json"));

        [Fact]
        public void Execute_AdHocRule_ReportsTheContentHashOfWhatRan()
            => Assert.Equal(ContentHash.Compute(StrictRule), Provenance(AdHoc("{\"amount\":5000}")).GetProperty("contentHash").GetString());

        [Fact]
        public void Execute_AdHocRule_HasNoStoredIdentity()
        {
            var provenance = Provenance(AdHoc("{\"amount\":5000}"));
            Assert.Equal((JsonValueKind.Null, JsonValueKind.Null, JsonValueKind.Null),
                (provenance.GetProperty("ruleId").ValueKind, provenance.GetProperty("ruleVersionId").ValueKind, provenance.GetProperty("ruleKey").ValueKind));
        }

        [Fact]
        public void Execute_CorrelationId_IsEchoedVerbatim()
            => Assert.Equal("case 42 / Ümlaut", Provenance(AdHoc("{\"amount\":5000}", ("CorrelationId", "case 42 / Ümlaut"))).GetProperty("correlationId").GetString());

        [Fact]
        public void Execute_CorrelationIdTooLong_IsAFault()
            => Assert.Throws<InvalidPluginExecutionException>(() => AdHoc("{\"amount\":5000}", ("CorrelationId", new string('x', 101))));

        [Fact]
        public void Execute_CorrelationIdAtLimit_IsAccepted()
            => Assert.Equal(100, Provenance(AdHoc("{\"amount\":5000}", ("CorrelationId", new string('x', 100)))).GetProperty("correlationId").GetString()!.Length);

        [Fact]
        public void Execute_Provenance_CarriesTheExecutionIdAndTime()
        {
            var context = AdHoc("{\"amount\":5000}");
            var provenance = Provenance(context);
            Assert.Equal((string)context.OutputParameters["ExecutionId"], provenance.GetProperty("executionId").GetString());
            Assert.True(DateTime.TryParse(provenance.GetProperty("evaluatedOnUtc").GetString(), out _));
        }

        [Fact]
        public void Execute_StoredVersion_ReportsItsIdentity()
        {
            var fake = new FakeOrganizationService();
            var ruleId = Guid.NewGuid();
            var versionId = Guid.NewGuid();
            fake.RetrieveById[versionId] = new Entity("qdb_edp_ruleversion", versionId)
            {
                ["qdb_edp_pcrmjson"] = StrictRule,
                ["qdb_edp_lifecyclestate"] = new OptionSetValue(100000003),
                ["qdb_edp_ruleid"] = new EntityReference("qdb_edp_rule", ruleId),
                ["qdb_edp_versionnumber"] = 3,
            };
            fake.RetrieveById[ruleId] = new Entity("qdb_edp_rule", ruleId) { ["qdb_edp_rulekey"] = "demo.strict" };

            var provenance = Provenance(Invoke(fake, ("RuleVersionId", versionId.ToString()), ("InputsJson", "{\"amount\":5000}")));

            Assert.Equal((ruleId.ToString(), "demo.strict", versionId.ToString(), 3),
                (provenance.GetProperty("ruleId").GetString(), provenance.GetProperty("ruleKey").GetString(),
                 provenance.GetProperty("ruleVersionId").GetString(), provenance.GetProperty("versionNumber").GetInt32()));
        }

        [Fact]
        public void ParseInputsJson_Decimal_IsReadExactly()
            => Assert.Equal(0.1m, RuleDecisionService.ParseInputsJson("{\"rate\":0.1}")["rate"]);

        [Fact]
        public void ParseInputsJson_NumberBeyondDecimal_IsKeptAsUnrepresentable()
            => Assert.IsType<UnrepresentableNumber>(RuleDecisionService.ParseInputsJson("{\"big\":1e400}")["big"]);

        [Fact]
        public void Execute_NumberBeyondDecimal_IsRejectedForAStrictRule()
            => Assert.Equal("INPUT_REJECTED", AdHoc("{\"amount\":1e400}").OutputParameters["Outcome"]);
    }
}

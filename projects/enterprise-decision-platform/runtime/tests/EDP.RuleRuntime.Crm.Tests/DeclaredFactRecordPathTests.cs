using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// FR-B1-03/04/10 and FR-B2-07 on the TargetRef path: a declared fact is never read from the
    /// record, even when a column of the same name exists, and a strict rule whose input fails its
    /// contract runs no retrieval.
    /// </summary>
    public class DeclaredFactRecordPathTests
    {
        private static readonly DateTime Now = new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc);

        // 'qdb_riskrating' is a declared fact that shares its name with a real column on the target.
        private const string StrictRule = """
        {
          "schemaVersion": "1.1", "inputContract": "strict", "name": "Coincident name", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Currency", "binding": "qdb_loanamount" },
            { "name": "qdb_riskrating", "type": "Text", "required": true, "nullable": false }
          ],
          "retrievals": [
            { "name": "history", "entity": "qdb_invoice", "select": [ "qdb_invoiceno" ], "maxRows": 10,
              "filter": { "op": "and", "conditions": [ { "field": "qdb_beneficiary", "operator": "Equals", "valueField": "qdb_riskrating" } ] } }
          ],
          "outputs": [ { "name": "band", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "qdb_riskrating", "operator": "Equals", "value": "High" } ] }, "then": { "band": "review" } } ],
            "otherwise": { "band": "standard" } }
        }
        """;

        private const string LenientRule = """
        {
          "name": "Coincident name, lenient", "targetEntity": "qdb_loanapplication",
          "inputs": [ { "name": "qdb_riskrating", "type": "Text" } ],
          "outputs": [ { "name": "band", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "qdb_riskrating", "operator": "Equals", "value": "High" } ] }, "then": { "band": "review" } } ],
            "otherwise": { "band": "standard" } }
        }
        """;

        private static InMemoryMetadataResolver Metadata() => new InMemoryMetadataResolver()
            .AddAttribute("qdb_loanapplication", "qdb_loanamount", FieldType.Currency)
            .AddAttribute("qdb_loanapplication", "qdb_riskrating", FieldType.Text)
            .AddAttribute("qdb_invoice", "qdb_invoiceno", FieldType.Text)
            .AddAttribute("qdb_invoice", "qdb_beneficiary", FieldType.Text);

        private static Entity Target() => new Entity("qdb_loanapplication", Guid.NewGuid())
        {
            ["qdb_loanamount"] = new Money(600000m),
            ["qdb_riskrating"] = "High"
        };

        private static DecisionOutcome Evaluate(FakeOrganizationService fake, string pcrm)
            => new RuleDecisionService(fake, Metadata(), new DataverseTraceSink(fake)).Evaluate(pcrm, Target(), Guid.NewGuid(), Guid.NewGuid(), Now);

        private static bool QueriedInvoices(FakeOrganizationService fake)
            => fake.Queried.OfType<QueryExpression>().Any(q => q.EntityName == "qdb_invoice");

        [Fact]
        public void Evaluate_LenientDeclaredFactWithCoincidentColumn_DoesNotReadTheColumn()
            => Assert.Equal("standard", Evaluate(new FakeOrganizationService(), LenientRule).Result.Outputs["band"]);

        [Fact]
        public void Evaluate_StrictRequiredDeclaredFact_IsRejectedBecauseTheRecordNeverSuppliesIt()
        {
            var result = Evaluate(new FakeOrganizationService(), StrictRule).Result;
            Assert.Equal((RuleOutcome.InputRejected, "EDP060"), (result.Outcome, result.Diagnostics.First(d => d.Severity == RuleErrorSeverity.Error).Code));
        }

        [Fact]
        public void Evaluate_RejectedStrictInput_RunsNoRetrieval()
        {
            var fake = new FakeOrganizationService();
            Evaluate(fake, StrictRule);
            Assert.False(QueriedInvoices(fake));
        }

        [Fact]
        public void Evaluate_AcceptedStrictInput_RunsTheRetrieval()
        {
            var fake = new FakeOrganizationService();
            Evaluate(fake, StrictRule.Replace("\"required\": true, \"nullable\": false", "\"required\": false"));
            Assert.True(QueriedInvoices(fake));
        }

        [Fact]
        public void Evaluate_RejectedInput_IsTracedAsRejected()
        {
            var fake = new FakeOrganizationService();
            Evaluate(fake, StrictRule);
            var trace = Assert.Single(fake.Created, e => e.LogicalName == "qdb_edp_ruleexecutionlog");
            Assert.Equal("rejected", trace["qdb_edp_outcome"]);
        }

        [Fact]
        public void Evaluate_BoundInput_IsStillReadFromTheRecord()
        {
            const string bound = """
            { "name": "Bound", "targetEntity": "qdb_loanapplication",
              "inputs": [ { "name": "rating", "type": "Text", "binding": "qdb_riskrating" } ],
              "outputs": [ { "name": "band", "type": "Text" } ],
              "logic": { "type": "conditionSet",
                "rules": [ { "when": { "op": "and", "conditions": [ { "field": "rating", "operator": "Equals", "value": "High" } ] }, "then": { "band": "review" } } ],
                "otherwise": { "band": "standard" } } }
            """;
            Assert.Equal("review", Evaluate(new FakeOrganizationService(), bound).Result.Outputs["band"]);
        }
    }
}

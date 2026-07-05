using System;
using System.Collections.Generic;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// Milestone A: full compile→execute against PCRM fixtures with an in-memory
    /// metadata resolver — no live CRM. This is the fast local test loop.
    /// </summary>
    public class EndToEndTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc);

        // A rule that derives a variable via formula, then branches on it.
        private const string EligibilityRule = """
        {
          "ruleId": "elig-1", "name": "Loan Eligibility", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "birthDate", "type": "Date", "binding": "qdb_birthdate" },
            { "name": "income", "type": "Currency", "binding": "qdb_income" }
          ],
          "variables": [
            { "name": "age", "type": "WholeNumber", "formula": "DateDiff(birthDate, Today(), 'year')" }
          ],
          "outputs": [ { "name": "eligible", "type": "Boolean" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "conditions": [
                  { "field": "age", "operator": "GreaterThanOrEqual", "value": 21 },
                  { "field": "income", "operator": "GreaterThanOrEqual", "value": 50000 }
              ] }, "then": { "eligible": true } }
            ],
            "otherwise": { "eligible": false }
          }
        }
        """;

        private static RuleRuntimeService Service() => new RuleRuntimeService(new InMemoryMetadataResolver()
            .AddAttribute("qdb_loanapplication", "qdb_birthdate", FieldType.Date)
            .AddAttribute("qdb_loanapplication", "qdb_income", FieldType.Currency));

        [Fact]
        public void Eligible_when_age_and_income_thresholds_met()
        {
            var inputs = new Dictionary<string, object?>
            {
                ["birthDate"] = new DateTime(1990, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                ["income"] = 60000m
            };
            var r = Service().Execute(EligibilityRule, inputs, Now);
            Assert.True(r.Success);
            Assert.Equal(true, r.Outputs["eligible"]);
            // variable was computed and traced
            Assert.Contains(r.Trace.Steps, s => s.Kind == "variable");
        }

        [Fact]
        public void Ineligible_when_income_below_threshold()
        {
            var inputs = new Dictionary<string, object?>
            {
                ["birthDate"] = new DateTime(1990, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                ["income"] = 20000m
            };
            Assert.Equal(false, Service().Execute(EligibilityRule, inputs, Now).Outputs["eligible"]);
        }

        [Fact]
        public void Execution_is_deterministic_across_repeat_runs()
        {
            var inputs = new Dictionary<string, object?>
            {
                ["birthDate"] = new DateTime(2010, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                ["income"] = 60000m
            };
            var svc = Service();
            var a = svc.Execute(EligibilityRule, inputs, Now);
            var b = svc.Execute(EligibilityRule, inputs, Now);
            Assert.Equal(a.Outputs["eligible"], b.Outputs["eligible"]);
        }

        [Fact]
        public void TestRule_harness_reports_timing_and_outputs()
        {
            var inputs = new Dictionary<string, object?>
            {
                ["birthDate"] = new DateTime(1990, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                ["income"] = 60000m
            };
            var r = Service().TestRule(EligibilityRule, inputs, Now);
            Assert.True(r.Success);
            Assert.True(r.ElapsedMilliseconds >= 0);
        }
    }
}

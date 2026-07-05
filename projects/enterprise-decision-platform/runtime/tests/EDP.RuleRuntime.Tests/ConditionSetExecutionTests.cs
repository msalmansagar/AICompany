using System;
using System.Collections.Generic;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class ConditionSetExecutionTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc);

        private static RuleRuntimeService NewService()
        {
            var metadata = new InMemoryMetadataResolver()
                .AddAttribute("qdb_loanapplication", "qdb_loanamount", FieldType.Decimal)
                .AddAttribute("qdb_loanapplication", "qdb_riskrating", FieldType.Text);
            return new RuleRuntimeService(metadata);
        }

        // The designer spec's worked example:
        // If Loan Amount > 500,000 AND Risk Rating = High THEN Approval Level = CEO, else Manager.
        private const string DoaRule = """
        {
          "ruleId": "doa-1", "name": "DOA Approval", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Decimal", "binding": "qdb_loanamount" },
            { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" }
          ],
          "outputs": [ { "name": "approvalLevel", "type": "Text" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "conditions": [
                  { "field": "loanAmount", "operator": "GreaterThan", "value": 500000 },
                  { "field": "riskRating", "operator": "Equals", "value": "High" }
              ] }, "then": { "approvalLevel": "CEO" } }
            ],
            "otherwise": { "approvalLevel": "Manager" }
          }
        }
        """;

        [Fact]
        public void High_value_high_risk_routes_to_CEO()
        {
            var result = NewService().Execute(DoaRule,
                new Dictionary<string, object?> { ["loanAmount"] = 600000m, ["riskRating"] = "High" }, Now);

            Assert.True(result.Success);
            Assert.True(result.Matched);
            Assert.Equal("CEO", result.Outputs["approvalLevel"]);
        }

        [Fact]
        public void Low_value_falls_through_to_otherwise()
        {
            var result = NewService().Execute(DoaRule,
                new Dictionary<string, object?> { ["loanAmount"] = 100000m, ["riskRating"] = "High" }, Now);

            Assert.True(result.Matched);
            Assert.Equal("Manager", result.Outputs["approvalLevel"]);
        }

        [Fact]
        public void Nested_or_group_matches_either_branch()
        {
            const string rule = """
            {
              "ruleId": "r", "name": "n", "targetEntity": "qdb_loanapplication",
              "inputs": [ { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" } ],
              "logic": { "type": "conditionSet", "rules": [
                { "when": { "op": "or", "conditions": [
                    { "field": "riskRating", "operator": "Equals", "value": "High" },
                    { "field": "riskRating", "operator": "Equals", "value": "Critical" }
                ] }, "then": { "review": "required" } }
              ] }
            }
            """;
            var svc = new RuleRuntimeService(new InMemoryMetadataResolver()
                .AddAttribute("qdb_loanapplication", "qdb_riskrating", FieldType.Text));

            Assert.Equal("required", svc.Execute(rule, new Dictionary<string, object?> { ["riskRating"] = "Critical" }, Now).Outputs["review"]);
            Assert.False(svc.Execute(rule, new Dictionary<string, object?> { ["riskRating"] = "Low" }, Now).Matched);
        }

        [Fact]
        public void Trace_records_each_step()
        {
            var result = NewService().Execute(DoaRule,
                new Dictionary<string, object?> { ["loanAmount"] = 600000m, ["riskRating"] = "High" }, Now);

            Assert.Contains(result.Trace.Steps, s => s.Kind == "condition");
            Assert.Contains(result.Trace.Steps, s => s.Kind == "branch" && s.Result == true);
        }

        [Fact]
        public void Invalid_operator_fails_compilation_with_diagnostics()
        {
            const string bad = """
            {
              "ruleId": "r", "name": "n", "targetEntity": "qdb_loanapplication",
              "inputs": [ { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" } ],
              "logic": { "type": "conditionSet", "rules": [
                { "when": { "op": "and", "conditions": [
                    { "field": "riskRating", "operator": "Frobnicate", "value": "High" }
                ] }, "then": { "x": 1 } }
              ] }
            }
            """;
            var svc = new RuleRuntimeService(new InMemoryMetadataResolver()
                .AddAttribute("qdb_loanapplication", "qdb_riskrating", FieldType.Text));

            var ex = Assert.Throws<EDP.RuleRuntime.Execution.RuleCompilationException>(
                () => svc.Execute(bad, new Dictionary<string, object?>(), Now));
            Assert.Contains(ex.Diagnostics, d => d.Code == "EDP003");
        }
    }
}

using System;
using System.Collections.Generic;
using System.Collections;
using System.Linq;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class DecisionTableTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc);

        private static RuleRuntimeService Service() => new RuleRuntimeService(
            new InMemoryMetadataResolver().AddAttribute("qdb_loanapplication", "qdb_score", FieldType.WholeNumber));

        private static string Table(string hitPolicy) => $$"""
        {
          "ruleId": "t", "name": "Risk Tier", "targetEntity": "qdb_loanapplication",
          "inputs": [ { "name": "score", "type": "WholeNumber", "binding": "qdb_score" } ],
          "logic": {
            "type": "decisionTable",
            "hitPolicy": "{{hitPolicy}}",
            "tableInputs": [ { "field": "score" } ],
            "outputColumns": [ "tier" ],
            "rows": [
              { "priority": 3, "cells": [ { "operator": "GreaterThanOrEqual", "value": 800 } ], "outputs": { "tier": "A" } },
              { "priority": 2, "cells": [ { "operator": "GreaterThanOrEqual", "value": 600 } ], "outputs": { "tier": "B" } },
              { "priority": 1, "cells": [ { "operator": "GreaterThanOrEqual", "value": 0 } ],   "outputs": { "tier": "C" } }
            ],
            "defaultRow": { "outputs": { "tier": "Unknown" } }
          }
        }
        """;

        [Fact]
        public void Cell_compares_input_against_another_field()
        {
            const string table = """
            {
              "ruleId": "t", "name": "Balance check", "targetEntity": "qdb_loanapplication",
              "inputs": [
                { "name": "requested", "type": "Decimal", "binding": "qdb_requested" },
                { "name": "balance", "type": "Decimal", "binding": "qdb_balance" }
              ],
              "logic": {
                "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "requested" } ],
                "outputColumns": [ "decision" ],
                "rows": [
                  { "priority": 2, "cells": [ { "operator": "GreaterThan", "valueField": "balance" } ], "outputs": { "decision": "Refer" } },
                  { "priority": 1, "cells": [ { "any": true } ], "outputs": { "decision": "Auto" } }
                ]
              }
            }
            """;
            var svc = new RuleRuntimeService(new InMemoryMetadataResolver()
                .AddAttribute("qdb_loanapplication", "qdb_requested", FieldType.Decimal)
                .AddAttribute("qdb_loanapplication", "qdb_balance", FieldType.Decimal));

            Assert.Equal("Refer", svc.Execute(table, new Dictionary<string, object?> { ["requested"] = 900m, ["balance"] = 500m }, Now).Outputs["decision"]);
            Assert.Equal("Auto", svc.Execute(table, new Dictionary<string, object?> { ["requested"] = 300m, ["balance"] = 500m }, Now).Outputs["decision"]);
        }

        [Fact]
        public void First_match_returns_first_matching_row_in_order()
        {
            var r = Service().Execute(Table("First"), new Dictionary<string, object?> { ["score"] = 850m }, Now);
            Assert.Equal("A", r.Outputs["tier"]);
        }

        [Fact]
        public void First_match_on_mid_score_skips_higher_tiers()
        {
            var r = Service().Execute(Table("First"), new Dictionary<string, object?> { ["score"] = 650m }, Now);
            Assert.Equal("B", r.Outputs["tier"]);
        }

        [Fact]
        public void Priority_policy_returns_highest_priority_match()
        {
            // score 850 matches all three rows; priority 3 (tier A) wins.
            var r = Service().Execute(Table("Priority"), new Dictionary<string, object?> { ["score"] = 850m }, Now);
            Assert.Equal("A", r.Outputs["tier"]);
        }

        [Fact]
        public void All_policy_accumulates_every_matching_row()
        {
            var r = Service().Execute(Table("All"), new Dictionary<string, object?> { ["score"] = 850m }, Now);
            var tiers = Assert.IsAssignableFrom<IEnumerable>(r.Outputs["tier"]).Cast<object?>().ToList();
            Assert.Equal(new object?[] { "A", "B", "C" }, tiers);
        }

        [Fact]
        public void Unique_policy_throws_when_multiple_rows_match()
        {
            var r = Service().Execute(Table("Unique"), new Dictionary<string, object?> { ["score"] = 850m }, Now);
            Assert.False(r.Success);
            Assert.Contains(r.Diagnostics, d => d.Code == "rule_execution_failed");
        }

        [Fact]
        public void Default_row_applies_when_nothing_matches()
        {
            const string table = """
            {
              "ruleId": "t", "name": "n", "targetEntity": "qdb_loanapplication",
              "inputs": [ { "name": "score", "type": "WholeNumber", "binding": "qdb_score" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
                "rows": [ { "priority": 1, "cells": [ { "operator": "GreaterThanOrEqual", "value": 900 } ], "outputs": { "tier": "A" } } ],
                "defaultRow": { "outputs": { "tier": "Unknown" } } }
            }
            """;
            var r = Service().Execute(table, new Dictionary<string, object?> { ["score"] = 100m }, Now);
            Assert.True(r.Matched);
            Assert.Equal("Unknown", r.Outputs["tier"]);
        }
    }
}

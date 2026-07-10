using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Scenarios;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class ScenarioRunnerTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc);

        private static RuleRuntimeService Service() => new RuleRuntimeService(
            new InMemoryMetadataResolver().AddAttribute("qdb_loanapplication", "qdb_score", FieldType.WholeNumber));

        private const string Pcrm = """
        {
          "ruleId": "t", "name": "Risk Tier", "targetEntity": "qdb_loanapplication",
          "inputs": [ { "name": "score", "type": "WholeNumber", "binding": "qdb_score" } ],
          "logic": {
            "type": "decisionTable", "hitPolicy": "First",
            "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
            "rows": [
              { "priority": 2, "cells": [ { "operator": "GreaterThanOrEqual", "value": 800 } ], "outputs": { "tier": "A" } },
              { "priority": 1, "cells": [ { "operator": "GreaterThanOrEqual", "value": 0 } ],   "outputs": { "tier": "B" } }
            ]
          }
        }
        """;

        [Fact]
        public void All_passing_scenarios_report_all_passed()
        {
            const string scenarios = """
            [
              { "name": "high scores tier A", "inputs": { "score": 850 }, "expected": { "tier": "A" } },
              { "name": "low scores tier B",  "inputs": { "score": 100 }, "expected": { "tier": "B" } }
            ]
            """;
            var summary = ScenarioRunner.Run(scenarios, Pcrm, Service(), Now);
            Assert.Equal(2, summary.Total);
            Assert.Equal(2, summary.Passed);
            Assert.True(summary.AllPassed);
        }

        [Fact]
        public void A_scenario_with_a_wrong_expectation_fails()
        {
            const string scenarios = """
            [
              { "name": "wrong expectation", "inputs": { "score": 850 }, "expected": { "tier": "B" } }
            ]
            """;
            var summary = ScenarioRunner.Run(scenarios, Pcrm, Service(), Now);
            Assert.False(summary.AllPassed);
            Assert.Equal(1, summary.Failed);
            var failed = Assert.Single(summary.Results, r => !r.Passed);
            Assert.Contains(failed.Mismatches, m => m.Contains("tier"));
        }

        [Fact]
        public void An_empty_or_null_suite_passes_vacuously()
        {
            var summary = ScenarioRunner.Run(null, Pcrm, Service(), Now);
            Assert.Equal(0, summary.Total);
            Assert.True(summary.AllPassed); // nothing to regress against
        }
    }
}

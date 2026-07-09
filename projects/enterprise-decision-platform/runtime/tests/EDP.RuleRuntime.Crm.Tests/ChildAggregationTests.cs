using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// The in-CRM binder folds an anchor's 1:N child collection into a scalar input:
    /// Count/Sum/Avg/Min/Max, with an optional in-memory child filter.
    /// </summary>
    public class ChildAggregationTests
    {
        private sealed class NoTrace : ITraceSink { public void WriteTrace(TraceRecord trace) { } }

        // A rule that emits "HIT" only when the aggregated collateral input equals `expected`.
        private static string AggPcrm(string function, string? binding, decimal expected, (string field, string op, object value)? filter = null)
        {
            var bindingJson = binding == null ? "" : $"\"binding\": \"{binding}\",";
            var filterJson = filter == null ? "" :
                $", \"filter\": {{ \"field\": \"{filter.Value.field}\", \"operator\": \"{filter.Value.op}\", \"value\": {ToJson(filter.Value.value)} }}";
            return $$"""
            {
              "ruleId": "agg", "name": "Collateral", "targetEntity": "qdb_loanapplication",
              "inputs": [ { "name": "total", "type": "Decimal", {{bindingJson}}
                "aggregate": { "function": "{{function}}", "childEntity": "qdb_collateral", "childLookup": "qdb_loanid"{{filterJson}} } } ],
              "outputs": [ { "name": "r", "type": "Text" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "total" } ], "outputColumns": [ "r" ],
                "rows": [
                  { "priority": 2, "cells": [ { "operator": "Equals", "value": {{expected}} } ], "outputs": { "r": "HIT" } },
                  { "priority": 1, "cells": [ { "any": true } ], "outputs": { "r": "miss" } }
                ] }
            }
            """;
        }

        private static string ToJson(object v) => v is string s ? $"\"{s}\"" : Convert.ToString(v)!;

        private static Entity Collateral(decimal value, string status)
        {
            var e = new Entity("qdb_collateral", Guid.NewGuid());
            e["qdb_value"] = value; e["qdb_status"] = status;
            return e;
        }

        private static string Run(List<Entity> children, string pcrm)
        {
            var fake = new FakeOrganizationService();
            fake.QueryResults["qdb_collateral"] = children;
            var loan = new Entity("qdb_loanapplication", Guid.NewGuid());
            var svc = new RuleDecisionService(fake, new InMemoryMetadataResolver(), new NoTrace());
            var result = svc.Evaluate(pcrm, loan, null, Guid.Empty, DateTime.UtcNow);
            Assert.True(result.Success);
            return result.Outputs["r"]?.ToString() ?? "";
        }

        private static List<Entity> ThreeItems() => new List<Entity>
        {
            Collateral(100000m, "Active"), Collateral(50000m, "Active"), Collateral(30000m, "Rejected"),
        };

        [Fact] public void Sum_folds_child_values() => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Sum", "qdb_value", 180000m)));
        [Fact] public void Count_counts_children() => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Count", null, 3m)));
        [Fact] public void Min_folds_child_values() => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Min", "qdb_value", 30000m)));
        [Fact] public void Max_folds_child_values() => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Max", "qdb_value", 100000m)));
        [Fact] public void Avg_folds_child_values() => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Avg", "qdb_value", 60000m)));

        [Fact]
        public void Filter_restricts_the_children_summed()
            => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Sum", "qdb_value", 150000m, ("qdb_status", "Equals", "Active"))));

        [Fact]
        public void Count_with_filter_expresses_any_all()
            => Assert.Equal("HIT", Run(ThreeItems(), AggPcrm("Count", null, 1m, ("qdb_status", "Equals", "Rejected"))));

        [Fact]
        public void Empty_collection_counts_zero() => Assert.Equal("HIT", Run(new List<Entity>(), AggPcrm("Count", null, 0m)));

        [Fact]
        public void Empty_collection_sums_zero() => Assert.Equal("HIT", Run(new List<Entity>(), AggPcrm("Sum", "qdb_value", 0m)));
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class ReasonCodeTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 11, 0, 0, 0, DateTimeKind.Utc);

        private static RuleRuntimeService Svc() => new RuleRuntimeService(
            new InMemoryMetadataResolver().AddAttribute("e", "score", FieldType.WholeNumber));

        // Two overlapping rows (a high-score row and a catch-all), each carrying its own reason codes.
        private static string Table(string hitPolicy) => $$"""
        {
          "ruleId": "t", "name": "n", "targetEntity": "e",
          "inputs": [ { "name": "score", "type": "WholeNumber" } ],
          "logic": {
            "type": "decisionTable", "hitPolicy": "{{hitPolicy}}",
            "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
            "rows": [
              { "priority": 2, "cells": [ { "operator": "GreaterThanOrEqual", "value": 800 } ], "outputs": { "tier": "A" }, "reasonCodes": [ "HIGH_SCORE", "SHARED" ] },
              { "priority": 1, "cells": [ { "any": true } ], "outputs": { "tier": "B" }, "reasonCodes": [ "CATCH_ALL", "SHARED" ] }
            ]
          }
        }
        """;

        private static IReadOnlyList<string> Run(string pcrm, int score)
            => Svc().Execute(pcrm, new Dictionary<string, object?> { ["score"] = score }, Now).ReasonCodes;

        [Fact]
        public void First_policy_emits_only_the_winning_rows_codes()
        {
            Assert.Equal(new[] { "HIGH_SCORE", "SHARED" }, Run(Table("First"), 850));
        }

        [Fact]
        public void Priority_policy_emits_the_highest_priority_rows_codes_not_the_lower_match()
        {
            // score 850 matches both rows; priority picks the high-score row — the catch-all's codes must not leak.
            var codes = Run(Table("Priority"), 850);
            Assert.Contains("HIGH_SCORE", codes);
            Assert.DoesNotContain("CATCH_ALL", codes);
        }

        [Fact]
        public void All_policy_unions_matched_rows_codes_and_deduplicates()
        {
            // both rows match; SHARED appears on both but must be emitted once, order preserved.
            Assert.Equal(new[] { "HIGH_SCORE", "SHARED", "CATCH_ALL" }, Run(Table("All"), 850));
        }

        [Fact]
        public void Default_row_codes_are_emitted_when_nothing_matches()
        {
            const string table = """
            {
              "ruleId": "t", "name": "n", "targetEntity": "e",
              "inputs": [ { "name": "score", "type": "WholeNumber" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
                "rows": [ { "priority": 1, "cells": [ { "operator": "GreaterThanOrEqual", "value": 900 } ], "outputs": { "tier": "A" }, "reasonCodes": [ "TOP_TIER" ] } ],
                "defaultRow": { "outputs": { "tier": "Unknown" }, "reasonCodes": [ "NO_RULE_MATCHED" ] } }
            }
            """;
            Assert.Equal(new[] { "NO_RULE_MATCHED" }, Run(table, 100));
        }

        [Fact]
        public void Condition_set_emits_the_matched_branch_codes()
        {
            const string cs = """
            {
              "ruleId": "t", "name": "n", "targetEntity": "e",
              "inputs": [ { "name": "score", "type": "WholeNumber" } ],
              "logic": { "type": "conditionSet",
                "rules": [ { "when": { "op": "and", "conditions": [ { "field": "score", "operator": "GreaterThanOrEqual", "value": 800 } ] }, "then": { "tier": "A" }, "reasonCodes": [ "CS_HIGH" ] } ],
                "otherwise": { "tier": "B" } }
            }
            """;
            Assert.Equal(new[] { "CS_HIGH" }, Run(cs, 850));
        }

        [Fact]
        public void Blank_codes_are_ignored_at_runtime()
        {
            const string table = """
            {
              "ruleId": "t", "name": "n", "targetEntity": "e",
              "inputs": [ { "name": "score", "type": "WholeNumber" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
                "rows": [ { "priority": 1, "cells": [ { "any": true } ], "outputs": { "tier": "A" }, "reasonCodes": [ "VALID", "", "  " ] } ] }
            }
            """;
            Assert.Equal(new[] { "VALID" }, Run(table, 1));
        }

        [Fact]
        public void No_match_produces_no_reason_codes()
        {
            const string table = """
            {
              "ruleId": "t", "name": "n", "targetEntity": "e",
              "inputs": [ { "name": "score", "type": "WholeNumber" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First",
                "tableInputs": [ { "field": "score" } ], "outputColumns": [ "tier" ],
                "rows": [ { "priority": 1, "cells": [ { "operator": "GreaterThanOrEqual", "value": 900 } ], "outputs": { "tier": "A" }, "reasonCodes": [ "TOP" ] } ] }
            }
            """;
            var result = Svc().Execute(table, new Dictionary<string, object?> { ["score"] = 100 }, Now);
            Assert.False(result.Matched);
            Assert.Empty(result.ReasonCodes);
        }
    }
}

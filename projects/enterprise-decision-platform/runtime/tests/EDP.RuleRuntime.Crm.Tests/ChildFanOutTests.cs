using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// Per-child fan-out (FR-F43, ADR-17). One rule, one invocation, a verdict per child.
    /// The worked case is the specimen's unit-price check: each invoice line is graded
    /// independently and the anchor gets counts it can summarise from.
    /// </summary>
    public class ChildFanOutTests
    {
        private sealed class NoTrace : ITraceSink { public Guid? WriteTrace(TraceRecord trace) => null; }

        private sealed class RecordingTrace : ITraceSink
        {
            public List<TraceRecord> Written { get; } = new List<TraceRecord>();
            public Guid? WriteTrace(TraceRecord trace) { Written.Add(trace); return Guid.NewGuid(); }
        }

        private static readonly DateTime Now = new DateTime(2026, 8, 19, 0, 0, 0, DateTimeKind.Utc);

        /// <summary>Flags a line whose variance exceeds tolerance. Reason code carries the why.</summary>
        private const string ToleranceRule = """
        {
          "ruleId": "tol", "name": "Unit price tolerance", "targetEntity": "qdb_disbursement",
          "inputs": [ { "name": "variancePercent", "type": "Decimal" }, { "name": "tolerance", "type": "Decimal" } ],
          "outputs": [ { "name": "verdict", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [
                { "field": "variancePercent", "operator": "GreaterThan", "valueField": "tolerance" } ] },
              "then": { "verdict": "Fail" }, "reasonCodes": [ "PRICE_ABOVE_TOLERANCE" ] } ],
            "otherwise": { "verdict": "Pass" } }
        }
        """;

        private static RuleDecisionService Service(ITraceSink sink)
            => new RuleDecisionService(new FakeOrganizationService(), new InMemoryMetadataResolver(), sink);

        private static object? Line(string id, decimal variancePercent)
            => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = id,
                ["variancePercent"] = variancePercent,
            };

        private static FanOutRequest Request(params object?[] lines)
            => new FanOutRequest(
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["tolerance"] = 5m,
                    ["lines"] = lines.ToList(),
                },
                "lines",
                Now);

        [Fact]
        public void Each_child_gets_its_own_verdict()
        {
            var outcome = Service(new NoTrace()).EvaluateForEachChild(
                ToleranceRule, Request(Line("a", 2m), Line("b", 12m), Line("c", 4m)));

            Assert.Equal(3, outcome.Total);
            Assert.Equal("Pass", outcome.Children[0].Result.Outputs["verdict"]);
            Assert.Equal("Fail", outcome.Children[1].Result.Outputs["verdict"]);
            Assert.Equal("Pass", outcome.Children[2].Result.Outputs["verdict"]);
        }

        [Fact]
        public void Each_child_carries_its_own_reason_codes()
        {
            var outcome = Service(new NoTrace()).EvaluateForEachChild(
                ToleranceRule, Request(Line("a", 2m), Line("b", 12m)));

            Assert.Empty(outcome.Children[0].Result.ReasonCodes);
            Assert.Equal(new[] { "PRICE_ABOVE_TOLERANCE" }, outcome.Children[1].Result.ReasonCodes);
        }

        [Fact]
        public void Counts_are_what_an_anchor_summary_is_built_from()
        {
            var outcome = Service(new NoTrace()).EvaluateForEachChild(
                ToleranceRule, Request(Line("a", 12m), Line("b", 2m), Line("c", 9m)));

            // "2 of 3 invoice lines failed the unit-price check" — ADR-17 rung 1.
            Assert.Equal(3, outcome.Total);
            Assert.Equal(3, outcome.MatchedCount); // every line matched a branch
            Assert.True(outcome.AllSucceeded);
            Assert.Equal(2, outcome.Children.Count(c => Equals(c.Result.Outputs["verdict"], "Fail")));
        }

        [Fact]
        public void A_child_is_addressed_by_index_always_and_by_id_when_it_has_one()
        {
            var withoutId = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["variancePercent"] = 1m };

            var outcome = Service(new NoTrace()).EvaluateForEachChild(
                ToleranceRule, Request(Line("line-1", 1m), withoutId));

            Assert.Equal(0, outcome.Children[0].Index);
            Assert.Equal("line-1", outcome.Children[0].Id);

            // An unsaved grid row has no id — ADR-17 says a caller must not assume otherwise.
            Assert.Equal(1, outcome.Children[1].Index);
            Assert.Null(outcome.Children[1].Id);
        }

        [Fact]
        public void Child_fields_shadow_anchor_inputs_of_the_same_name()
        {
            // The line's own tolerance wins over the anchor's — the same scoping rule a
            // quantifier body uses, so authors read one model rather than two.
            var strictLine = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = "strict",
                ["variancePercent"] = 4m,
                ["tolerance"] = 1m,
            };

            var outcome = Service(new NoTrace()).EvaluateForEachChild(ToleranceRule, Request(strictLine));

            Assert.Equal("Fail", outcome.Children[0].Result.Outputs["verdict"]);
        }

        [Fact]
        public void An_empty_collection_yields_no_children_and_does_not_throw()
        {
            var outcome = Service(new NoTrace()).EvaluateForEachChild(ToleranceRule, Request());

            Assert.Equal(0, outcome.Total);
            Assert.True(outcome.AllSucceeded);
        }

        [Fact]
        public void A_missing_collection_is_treated_as_empty()
        {
            var request = new FanOutRequest(
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["tolerance"] = 5m },
                "nothingHere",
                Now);

            Assert.Equal(0, Service(new NoTrace()).EvaluateForEachChild(ToleranceRule, request).Total);
        }

        [Fact]
        public void One_trace_is_written_for_the_whole_fan_out_not_one_per_child()
        {
            // N log writes per save would defeat ADR-13's tier-2 posture. Durable per-child
            // evidence is F2 snapshotting, not this.
            var sink = new RecordingTrace();

            var outcome = Service(sink).EvaluateForEachChild(
                ToleranceRule, Request(Line("a", 1m), Line("b", 2m), Line("c", 3m)));

            var trace = Assert.Single(sink.Written);
            Assert.Equal("matched", trace.Outcome);
            Assert.Contains("\"total\":3", trace.TraceJson);
            Assert.NotNull(outcome.ExecutionLogId);
        }

        [Fact]
        public void Fanning_out_requires_a_collection_name()
        {
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            Assert.Throws<ArgumentException>(() => new FanOutRequest(inputs, "  ", Now));
        }
    }
}

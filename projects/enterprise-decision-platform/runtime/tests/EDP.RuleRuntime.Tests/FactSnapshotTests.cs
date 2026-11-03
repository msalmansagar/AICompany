using System;
using System.Collections.Generic;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Snapshots;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// EDP-FACT-001 F2 — fact snapshotting (FR-F30, FR-F34) and the replay gate (FR-F31).
    ///
    /// FR-F31 is a RELEASE GATE from F2 onward, so these are not ordinary tests: if replay stops
    /// reproducing a verdict, the governance case behind Option B is gone and nothing in F2 should
    /// ship.
    /// </summary>
    public class FactSnapshotTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 19, 9, 30, 0, DateTimeKind.Utc);

        private static Dictionary<string, object?> Facts() => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["tolerance"] = 5m,
            ["lines"] = new List<object?>
            {
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["ref"] = "11", ["variancePercent"] = 2m },
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["ref"] = "12", ["variancePercent"] = 12m },
            },
        };

        // ---- capture -------------------------------------------------------------------

        [Fact]
        public void A_snapshot_copies_the_facts_so_later_mutation_cannot_rewrite_history()
        {
            var facts = Facts();
            var snapshot = FactSnapshot.Capture(facts, Now);

            facts["tolerance"] = 999m;

            Assert.Equal(5m, snapshot.Inputs["tolerance"]);
        }

        [Fact]
        public void The_evaluation_clock_is_captured_in_utc()
        {
            var snapshot = FactSnapshot.Capture(Facts(), new DateTime(2026, 8, 19, 9, 30, 0, DateTimeKind.Utc));

            Assert.Equal(DateTimeKind.Utc, snapshot.CapturedAtUtc.Kind);
            Assert.Equal(Now, snapshot.CapturedAtUtc);
        }

        // ---- digest (FR-F34) -----------------------------------------------------------

        [Fact]
        public void The_same_facts_produce_the_same_digest()
            => Assert.Equal(FactSnapshot.Capture(Facts(), Now).Digest, FactSnapshot.Capture(Facts(), Now).Digest);

        [Fact]
        public void Key_order_does_not_change_the_digest()
        {
            var forward = new Dictionary<string, object?> { ["a"] = 1m, ["b"] = 2m };
            var reversed = new Dictionary<string, object?> { ["b"] = 2m, ["a"] = 1m };

            Assert.Equal(FactSnapshot.Capture(forward, Now).Digest, FactSnapshot.Capture(reversed, Now).Digest);
        }

        [Fact]
        public void A_changed_fact_changes_the_digest()
        {
            var altered = Facts();
            altered["tolerance"] = 7.5m;

            Assert.NotEqual(FactSnapshot.Capture(Facts(), Now).Digest, FactSnapshot.Capture(altered, Now).Digest);
        }

        [Fact]
        public void Reordering_a_collection_changes_the_digest_because_order_is_part_of_the_fact()
        {
            var reordered = Facts();
            var lines = (List<object?>)reordered["lines"]!;
            reordered["lines"] = new List<object?> { lines[1], lines[0] };

            Assert.NotEqual(FactSnapshot.Capture(Facts(), Now).Digest, FactSnapshot.Capture(reordered, Now).Digest);
        }

        [Fact]
        public void A_changed_clock_changes_the_digest()
            => Assert.NotEqual(FactSnapshot.Capture(Facts(), Now).Digest,
                               FactSnapshot.Capture(Facts(), Now.AddSeconds(1)).Digest);

        [Fact]
        public void A_restored_snapshot_recomputes_its_digest_rather_than_trusting_storage()
        {
            var original = FactSnapshot.Capture(Facts(), Now);

            var tampered = Facts();
            tampered["tolerance"] = 99m;
            var restored = FactSnapshot.Restore(tampered, Now);

            Assert.False(restored.MatchesDigest(original.Digest));
        }

        // ---- FR-F31: the release gate --------------------------------------------------

        private const string ToleranceRule = """
        {
          "ruleId": "tol", "name": "Unit price tolerance", "targetEntity": "qdb_disbursement",
          "inputs": [ { "name": "tolerance", "type": "Decimal" }, { "name": "lines", "type": "Text" } ],
          "outputs": [ { "name": "verdict", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "quantifiers": [
                { "kind": "some", "collection": "lines", "where": { "op": "and", "conditions": [
                    { "field": "variancePercent", "operator": "GreaterThan", "valueField": "tolerance" } ] } } ] },
              "then": { "verdict": "Fail" }, "reasonCodes": [ "PRICE_ABOVE_TOLERANCE" ] } ],
            "otherwise": { "verdict": "Pass" } }
        }
        """;

        [Fact]
        public void Replaying_a_decision_from_its_snapshot_reproduces_the_verdict_exactly()
        {
            var service = new RuleRuntimeService(new InMemoryMetadataResolver());
            var snapshot = FactSnapshot.Capture(Facts(), Now);

            var original = service.Execute(ToleranceRule, Facts(), Now);
            var replayed = service.Execute(ToleranceRule, new Dictionary<string, object?>(snapshot.Inputs), snapshot.CapturedAtUtc);

            Assert.Equal(original.Matched, replayed.Matched);
            Assert.Equal(original.Outputs["verdict"], replayed.Outputs["verdict"]);
            Assert.Equal(original.ReasonCodes, replayed.ReasonCodes);
        }

        [Fact]
        public void Replay_survives_a_moving_world_because_it_reads_the_snapshot_not_the_population()
        {
            var service = new RuleRuntimeService(new InMemoryMetadataResolver());
            var snapshot = FactSnapshot.Capture(Facts(), Now);
            var original = service.Execute(ToleranceRule, Facts(), Now);

            // The live population changes after the decision — the offending line is corrected.
            var movedOn = Facts();
            ((List<object?>)movedOn["lines"]!)[1] =
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["ref"] = "12", ["variancePercent"] = 1m };

            var live = service.Execute(ToleranceRule, movedOn, Now);
            var replayed = service.Execute(ToleranceRule, new Dictionary<string, object?>(snapshot.Inputs), snapshot.CapturedAtUtc);

            Assert.Equal("Fail", original.Outputs["verdict"]);
            Assert.Equal("Pass", live.Outputs["verdict"]);          // the world moved
            Assert.Equal("Fail", replayed.Outputs["verdict"]);      // the decision did not
        }
    }
}

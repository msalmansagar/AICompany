using System.Collections.Generic;
using System.Text.Json;
using EDP.RuleRuntime.Scenarios;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class ScenarioComparerTests
    {
        private static IReadOnlyDictionary<string, JsonElement> Expected(string json)
            => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

        [Fact]
        public void Matching_outputs_produce_no_mismatches()
        {
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""approvalLevel"": ""CEO"", ""manualReview"": true }"),
                new Dictionary<string, object?> { ["approvalLevel"] = "CEO", ["manualReview"] = true });
            Assert.Empty(mismatches);
        }

        [Fact]
        public void Numeric_formatting_differences_are_treated_as_equal()
        {
            // expected as JSON number, actual as decimal with trailing zeros
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""limit"": 500000 }"),
                new Dictionary<string, object?> { ["limit"] = 500000.00m });
            Assert.Empty(mismatches);
        }

        [Fact]
        public void Quoted_number_expectation_matches_numeric_output()
        {
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""limit"": ""500000"" }"),
                new Dictionary<string, object?> { ["limit"] = 500000m });
            Assert.Empty(mismatches);
        }

        [Fact]
        public void A_differing_value_is_reported_as_a_mismatch()
        {
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""approvalLevel"": ""CEO"" }"),
                new Dictionary<string, object?> { ["approvalLevel"] = "Manager" });
            var only = Assert.Single(mismatches);
            Assert.Contains("CEO", only);
            Assert.Contains("Manager", only);
        }

        [Fact]
        public void A_missing_output_is_reported()
        {
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""approvalLevel"": ""CEO"" }"),
                new Dictionary<string, object?>());
            Assert.Single(mismatches);
            Assert.Contains("no such output", mismatches[0]);
        }

        [Fact]
        public void Extra_actual_outputs_are_ignored()
        {
            // A scenario asserts a subset — outputs it does not mention must not fail it.
            var mismatches = ScenarioComparer.Compare(
                Expected(@"{ ""approvalLevel"": ""CEO"" }"),
                new Dictionary<string, object?> { ["approvalLevel"] = "CEO", ["notes"] = "irrelevant" });
            Assert.Empty(mismatches);
        }
    }
}

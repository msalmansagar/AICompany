using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// EDP-FACT-001 phase F1 — quantification over a collection (FR-F1, FR-F2, ADR-16).
    /// The worked case is the specimen's G1: every invoice on a disbursement request must
    /// carry a beneficiary name.
    /// </summary>
    public class QuantifierTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 19, 0, 0, 0, DateTimeKind.Utc);

        private static RuleRuntimeService NewService() => new RuleRuntimeService(new InMemoryMetadataResolver());

        /// <summary>G1: fail the disbursement when any invoice is missing a beneficiary name.</summary>
        private static string RuleFor(string kind) => $$"""
        {
          "ruleId": "g1", "name": "Beneficiary completeness", "targetEntity": "qdb_disbursement",
          "inputs": [ { "name": "invoices", "type": "Text" } ],
          "outputs": [ { "name": "consistent", "type": "Text" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "quantifiers": [
                  { "kind": "{{kind}}", "collection": "invoices",
                    "where": { "op": "and", "conditions": [
                      { "field": "beneficiaryName", "operator": "IsNotEmpty" }
                    ] } }
              ] }, "then": { "consistent": "Yes" } }
            ],
            "otherwise": { "consistent": "No" }
          }
        }
        """;

        private static IReadOnlyList<object?> Invoices(params string?[] beneficiaryNames)
            => beneficiaryNames
                .Select(name => (object?)new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["beneficiaryName"] = name
                })
                .ToList();

        private static RuleResult Run(string kind, IReadOnlyList<object?>? invoices)
            => NewService().Execute(RuleFor(kind), new Dictionary<string, object?> { ["invoices"] = invoices }, Now);

        // ---- the three quantifiers ----------------------------------------------------

        [Fact]
        public void All_is_satisfied_when_every_element_matches()
            => Assert.Equal("Yes", Run("all", Invoices("Ahmad", "Mukesh")).Outputs["consistent"]);

        [Fact]
        public void All_fails_when_one_element_does_not_match()
            => Assert.Equal("No", Run("all", Invoices("Ahmad", "")).Outputs["consistent"]);

        [Fact]
        public void Some_is_satisfied_when_one_element_matches()
            => Assert.Equal("Yes", Run("some", Invoices("", "Ahmad")).Outputs["consistent"]);

        [Fact]
        public void Some_fails_when_no_element_matches()
            => Assert.Equal("No", Run("some", Invoices("", null)).Outputs["consistent"]);

        [Fact]
        public void None_is_satisfied_when_no_element_matches()
            => Assert.Equal("Yes", Run("none", Invoices("", null)).Outputs["consistent"]);

        [Fact]
        public void None_fails_when_an_element_matches()
            => Assert.Equal("No", Run("none", Invoices("", "Ahmad")).Outputs["consistent"]);

        // ---- empty-collection semantics, chosen deliberately (ADR-16 §5) ---------------

        [Fact]
        public void All_over_an_empty_collection_is_vacuously_true()
        {
            // Deliberate divergence from JsonLogic, which returns false. "Do all elements
            // satisfy P?" and "are there any elements?" are separate questions, and a rule
            // that needs the second asks it with a count condition.
            Assert.Equal("Yes", Run("all", new List<object?>()).Outputs["consistent"]);
        }

        [Fact]
        public void None_over_an_empty_collection_is_true()
            => Assert.Equal("Yes", Run("none", new List<object?>()).Outputs["consistent"]);

        [Fact]
        public void Some_over_an_empty_collection_is_false()
            => Assert.Equal("No", Run("some", new List<object?>()).Outputs["consistent"]);

        [Fact]
        public void A_non_collection_is_treated_as_empty_and_said_so_in_the_trace()
        {
            var result = NewService().Execute(RuleFor("all"),
                new Dictionary<string, object?> { ["invoices"] = "not a collection" }, Now);

            Assert.Equal("Yes", result.Outputs["consistent"]); // vacuously true, as for empty
            Assert.Contains(result.Trace!.Steps,
                s => s.Kind == "quantifier" && s.Description.Contains("not a collection"));
        }

        [Fact]
        public void A_null_collection_is_treated_as_empty()
            => Assert.Equal("Yes", Run("all", null).Outputs["consistent"]);

        // ---- scoping -------------------------------------------------------------------

        [Fact]
        public void Element_fields_shadow_outer_symbols_of_the_same_name()
        {
            const string rule = """
            {
              "ruleId": "shadow", "name": "Shadowing", "targetEntity": "e",
              "inputs": [ { "name": "status", "type": "Text" }, { "name": "lines", "type": "Text" } ],
              "outputs": [ { "name": "hit", "type": "Text" } ],
              "logic": { "type": "conditionSet", "rules": [
                { "when": { "op": "and", "quantifiers": [
                    { "kind": "all", "collection": "lines", "where": { "op": "and", "conditions": [
                        { "field": "status", "operator": "Equals", "value": "child" } ] } } ] },
                  "then": { "hit": "child-scope" } } ],
                "otherwise": { "hit": "parent-scope" } }
            }
            """;

            var lines = new List<object?>
            {
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["status"] = "child" }
            };

            var result = NewService().Execute(rule,
                new Dictionary<string, object?> { ["status"] = "parent", ["lines"] = lines }, Now);

            Assert.Equal("child-scope", result.Outputs["hit"]);
        }

        [Fact]
        public void Scalar_elements_bind_to_the_item_symbol()
        {
            const string rule = """
            {
              "ruleId": "scalars", "name": "Scalar elements", "targetEntity": "e",
              "inputs": [ { "name": "amounts", "type": "Text" } ],
              "outputs": [ { "name": "allPositive", "type": "Text" } ],
              "logic": { "type": "conditionSet", "rules": [
                { "when": { "op": "and", "quantifiers": [
                    { "kind": "all", "collection": "amounts", "where": { "op": "and", "conditions": [
                        { "field": "item", "operator": "GreaterThan", "value": 0 } ] } } ] },
                  "then": { "allPositive": "Yes" } } ],
                "otherwise": { "allPositive": "No" } }
            }
            """;

            var service = NewService();
            var positive = service.Execute(rule,
                new Dictionary<string, object?> { ["amounts"] = new List<object?> { 5000m, 100000m } }, Now);
            var mixed = service.Execute(rule,
                new Dictionary<string, object?> { ["amounts"] = new List<object?> { 5000m, -1m } }, Now);

            Assert.Equal("Yes", positive.Outputs["allPositive"]);
            Assert.Equal("No", mixed.Outputs["allPositive"]);
        }

        // ---- trace ---------------------------------------------------------------------

        [Fact]
        public void Trace_records_the_quantifier_and_each_element_evaluated()
        {
            var result = Run("all", Invoices("Ahmad", "Mukesh"));

            var quantifier = Assert.Single(result.Trace!.Steps, s => s.Kind == "quantifier");
            Assert.Contains("ALL over 2 element(s) of 'invoices'", quantifier.Description);
            Assert.True(quantifier.Result);

            // One condition step per element, because the body is evaluated per element.
            Assert.Equal(2, result.Trace.Steps.Count(s => s.Kind == "condition" && s.Description.StartsWith("beneficiaryName")));
        }

        [Fact]
        public void All_short_circuits_on_the_first_failing_element()
        {
            var result = Run("all", Invoices("", "Ahmad", "Mukesh"));

            // Stops at the first element; the remaining two are never evaluated.
            Assert.Equal(1, result.Trace!.Steps.Count(s => s.Kind == "condition" && s.Description.StartsWith("beneficiaryName")));
        }

        // ---- value conversion ------------------------------------------------------------

        [Fact]
        public void A_json_array_becomes_a_collection_rather_than_raw_text()
        {
            using var document = JsonDocument.Parse("{\"refs\":[11,12]}");

            var converted = RuntimeValue.FromJson(document.RootElement.GetProperty("refs"));

            var collection = Assert.IsAssignableFrom<IReadOnlyList<object?>>(converted);
            Assert.Equal(new object?[] { 11m, 12m }, collection);
        }

        [Fact]
        public void A_json_object_becomes_a_field_addressable_record()
        {
            using var document = JsonDocument.Parse("{\"invoice\":{\"beneficiaryName\":\"Ahmad\"}}");

            var converted = RuntimeValue.FromJson(document.RootElement.GetProperty("invoice"));

            var record = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(converted);
            Assert.Equal("Ahmad", record["BENEFICIARYNAME"]); // case-insensitive, as everywhere else
        }

        [Fact]
        public void A_record_is_not_itself_treated_as_a_collection()
        {
            var record = new Dictionary<string, object?> { ["a"] = 1m };

            Assert.False(RuntimeValue.IsCollection(record));
            Assert.Empty(RuntimeValue.AsCollection(record));
        }
    }
}

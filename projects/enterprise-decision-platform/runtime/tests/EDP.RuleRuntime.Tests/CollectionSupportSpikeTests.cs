using System.Collections.Generic;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Formula;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// EDP-FACT-001 phase F1 spike. Characterises what the runtime does with a collection
    /// TODAY, so the architecture phase estimates against measured behaviour rather than the
    /// assumption that NCalc is what blocks collection support.
    ///
    /// These are characterisation tests: they assert current behaviour, including behaviour
    /// F1 intends to change. A failure here after F1 lands is expected and means the
    /// corresponding assertion should be updated, not that a defect was introduced.
    /// </summary>
    public class CollectionSupportSpikeTests
    {
        private static RuleExecutionContext Context(params (string Name, object? Value)[] inputs)
        {
            var dictionary = new Dictionary<string, object?>();
            foreach (var (name, value) in inputs) dictionary[name] = value;
            return new RuleExecutionContext(dictionary);
        }

        // ---- Q1: does the execution context carry a collection at all? -------------------

        [Fact]
        public void Context_carries_a_collection_unchanged()
        {
            var invoiceAmounts = new List<object?> { 5000m, 100000m };
            var context = Context(("amounts", invoiceAmounts));

            Assert.True(context.TryResolve("amounts", out var resolved));
            Assert.Same(invoiceAmounts, resolved);
        }

        // ---- Q2/Q3: does the operator layer accept one? ---------------------------------

        [Fact]
        public void In_operator_matches_against_a_reference_typed_collection()
        {
            var invoiceNumbers = new List<object?> { "1", "2", "5" };

            Assert.True(OperatorEvaluator.Evaluate("in", "2", invoiceNumbers, null));
            Assert.False(OperatorEvaluator.Evaluate("in", "9", invoiceNumbers, null));
        }

        [Fact]
        public void In_operator_silently_falls_back_to_string_matching_for_a_value_typed_collection()
        {
            // InList pattern-matches IEnumerable<object?>. List<decimal> is IEnumerable<decimal>,
            // and generic variance does not apply to value types, so this does NOT match the
            // collection branch — it falls through to the comma-separated string fallback over
            // "System.Collections.Generic.List`1[System.Decimal]".
            var amounts = new List<decimal> { 5000m, 100000m };

            Assert.False(OperatorEvaluator.Evaluate("in", 5000m, amounts, null));
        }

        [Fact]
        public void In_operator_accepts_a_json_array_directly()
        {
            using var document = JsonDocument.Parse("[\"1\",\"2\",\"5\"]");

            Assert.True(OperatorEvaluator.Evaluate("in", "2", document.RootElement, null));
        }

        // ---- Q4: where the flattening actually happens ------------------------------------

        [Fact]
        public void RuntimeValue_flattens_a_json_array_to_its_raw_text()
        {
            using var document = JsonDocument.Parse("{\"refs\":[11,12]}");
            var refs = document.RootElement.GetProperty("refs");

            var converted = RuntimeValue.FromJson(refs);

            // THIS is the ceiling, and it is ours — not NCalc's.
            Assert.IsType<string>(converted);
            Assert.Equal("[11,12]", converted);
        }

        // ---- Q5: does the formula engine reach a collection parameter? ---------------------

        [Fact]
        public void Formula_engine_resolves_a_collection_parameter_through_ncalc_in()
        {
            var context = Context(("invoiceNumbers", new List<object?> { "1", "2", "5" }));

            var matched = new FormulaEngine().Evaluate("'2' in invoiceNumbers", context);

            Assert.Equal(true, matched);
        }

        [Fact]
        public void Formula_engine_has_no_quantifier_over_a_collection()
        {
            var context = Context(("amounts", new List<object?> { 5000m, 100000m }));

            // No some/all/none/filter exists today — the gap F1 closes (FR-F1, FR-F2).
            Assert.ThrowsAny<System.Exception>(
                () => new FormulaEngine().Evaluate("Some(amounts, amounts > 0)", context));
        }
    }
}

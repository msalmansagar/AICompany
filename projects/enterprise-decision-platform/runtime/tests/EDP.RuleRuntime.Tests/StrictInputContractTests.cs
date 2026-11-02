using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Inputs;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// FR-B2 / TC-2: the hostile-input matrix against a strict rule. Every rejection is
    /// INPUT_REJECTED with a specific EDP06x code, and nothing is evaluated.
    /// </summary>
    public class StrictInputContractTests
    {
        private static readonly DateTime Now = new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc);

        private const string StrictRule = """
        {
          "schemaVersion": "1.1", "inputContract": "strict", "ruleId": "strict-1", "name": "Strict sample",
          "inputs": [
            { "name": "amount", "type": "Decimal", "required": true, "nullable": false },
            { "name": "count", "type": "WholeNumber" },
            { "name": "flag", "type": "Boolean" },
            { "name": "start", "type": "Date" },
            { "name": "at", "type": "DateTime" },
            { "name": "status", "type": "Choice" },
            { "name": "note", "type": "Text" },
            { "name": "items", "type": "Collection" }
          ],
          "outputs": [ { "name": "decision", "type": "Text" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "conditions": [ { "field": "amount", "operator": "GreaterThanOrEqual", "value": 1000 } ] },
                "then": { "decision": "approve" } }
            ],
            "otherwise": { "decision": "refer" }
          }
        }
        """;

        private static RuleResult Run(Dictionary<string, object?> inputs)
            => new RuleRuntimeService(new InMemoryMetadataResolver()).Execute(StrictRule, inputs, Now);

        private static Dictionary<string, object?> Valid() => new Dictionary<string, object?> { ["amount"] = 5000m };

        private static Dictionary<string, object?> ValidWith(string name, object? value)
        {
            var inputs = Valid();
            inputs[name] = value;
            return inputs;
        }

        private static string FirstErrorCode(RuleResult result)
            => result.Diagnostics.First(d => d.Severity == RuleErrorSeverity.Error).Code;

        [Fact]
        public void Execute_ValidInput_IsMatched()
            => Assert.Equal(RuleOutcome.Matched, Run(Valid()).Outcome);

        // The otherwise branch is a match (pre-1.1 semantics, unchanged by Outcome).
        [Fact]
        public void Execute_ValidInputBelowThreshold_TakesOtherwise()
            => Assert.Equal("refer", Run(new Dictionary<string, object?> { ["amount"] = 10m }).Outputs["decision"]);

        [Fact]
        public void Execute_EmptyInput_IsRejectedWithEdp060()
        {
            var result = Run(new Dictionary<string, object?>());
            Assert.Equal(RuleOutcome.InputRejected, result.Outcome);
            Assert.Equal("EDP060", FirstErrorCode(result));
        }

        [Fact]
        public void Execute_MissingRequiredWithOtherValues_IsRejectedWithEdp060()
            => Assert.Equal("EDP060", FirstErrorCode(Run(new Dictionary<string, object?> { ["count"] = 2m })));

        [Fact]
        public void Execute_NullWhereNotNullable_IsRejectedWithEdp061()
            => Assert.Equal("EDP061", FirstErrorCode(Run(new Dictionary<string, object?> { ["amount"] = null })));

        [Fact]
        public void Execute_NullOnNullableOptional_IsAccepted()
            => Assert.Equal(RuleOutcome.Matched, Run(ValidWith("count", null)).Outcome);

        [Fact]
        public void Execute_WrongPrimitiveForBoolean_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("flag", "true"))));

        [Fact]
        public void Execute_NumericString_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(new Dictionary<string, object?> { ["amount"] = "5000" })));

        [Fact]
        public void Execute_FractionalWholeNumber_IsRejectedWithEdp063()
            => Assert.Equal("EDP063", FirstErrorCode(Run(ValidWith("count", 2.5m))));

        [Fact]
        public void Execute_WholeNumberOverflow_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("count", 1e25m))));

        [Fact]
        public void Execute_DecimalOverflow_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(new Dictionary<string, object?> { ["amount"] = new UnrepresentableNumber("1e400") })));

        [Theory]
        [InlineData("2026-13-01")]
        [InlineData("2026-02-30")]
        [InlineData("28/09/2026")]
        [InlineData("2026-09-28T00:00:00Z")]
        public void Execute_InvalidDate_IsRejectedWithEdp062(string date)
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("start", date))));

        [Theory]
        [InlineData("2026-09-28")]
        [InlineData("2026-09-28T10:00:00")]
        [InlineData("not a time")]
        public void Execute_DateTimeWithoutOffset_IsRejectedWithEdp062(string instant)
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("at", instant))));

        [Fact]
        public void Execute_ChoiceLabel_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("status", "Approved"))));

        [Fact]
        public void Execute_FractionalChoice_IsRejectedWithEdp063()
            => Assert.Equal("EDP063", FirstErrorCode(Run(ValidWith("status", 1.5m))));

        [Fact]
        public void Execute_ArrayForScalar_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(new Dictionary<string, object?> { ["amount"] = new List<object?> { 5000m } })));

        [Fact]
        public void Execute_ObjectForScalar_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("note", new Dictionary<string, object?> { ["a"] = 1m }))));

        [Fact]
        public void Execute_ScalarForCollection_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", FirstErrorCode(Run(ValidWith("items", "a,b"))));

        [Fact]
        public void Execute_ExtraInput_IsIgnoredWithEdp067Notice()
        {
            var result = Run(ValidWith("unexpected", 1m));
            Assert.Equal(RuleOutcome.Matched, result.Outcome);
            Assert.Contains(result.Diagnostics, d => d.Code == "EDP067" && d.Severity == RuleErrorSeverity.Info);
        }

        [Fact]
        public void Execute_RejectedInput_EvaluatesNothing()
        {
            var result = Run(new Dictionary<string, object?> { ["amount"] = "5000" });
            Assert.Empty(result.Outputs);
        }

        [Fact]
        public void Execute_RejectedInput_ReportsEveryViolation()
        {
            var inputs = new Dictionary<string, object?> { ["amount"] = "5000", ["flag"] = 1m, ["count"] = 0.5m };
            var codes = Run(inputs).Diagnostics.Where(d => d.Severity == RuleErrorSeverity.Error).Select(d => d.Code).ToList();
            Assert.Equal(new[] { "EDP062", "EDP063", "EDP062" }, codes);
        }

        [Fact]
        public void Validate_StrictWholeNumber_IsNormalisedToLong()
        {
            var validation = new RuleRuntimeService(new InMemoryMetadataResolver())
                .ValidateInputs(StrictRule, ValidWith("count", 3m), InputOrigin.Caller);
            Assert.IsType<long>(validation.Inputs["count"]);
        }

        [Fact]
        public void Validate_StrictDate_IsNormalisedToUtcDateTime()
        {
            var validation = new RuleRuntimeService(new InMemoryMetadataResolver())
                .ValidateInputs(StrictRule, ValidWith("start", "2026-09-28"), InputOrigin.Caller);
            Assert.Equal(new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc), validation.Inputs["start"]);
        }

        [Fact]
        public void Validate_StrictDateTimeWithOffset_IsNormalisedToUtc()
        {
            var validation = new RuleRuntimeService(new InMemoryMetadataResolver())
                .ValidateInputs(StrictRule, ValidWith("at", "2026-09-28T10:00:00+03:00"), InputOrigin.Caller);
            Assert.Equal(new DateTime(2026, 9, 28, 7, 0, 0, DateTimeKind.Utc), validation.Inputs["at"]);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// FR-B2-09: a rule that does not opt into the strict contract behaves exactly as before 1.1.
    /// Type problems become warnings, values are never converted, and nothing is refused.
    /// </summary>
    public class LenientCompatibilityTests
    {
        private static readonly DateTime Now = new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc);

        // Shape of the live 'demo.risk-tier' rule: a caller-supplied tier with no binding.
        private const string LegacyTierRule = """
        {
          "schemaVersion": "1.0", "ruleId": "tier-1", "name": "Risk tier",
          "inputs": [ { "name": "tier", "type": "Text" }, { "name": "amount", "type": "Decimal" } ],
          "outputs": [ { "name": "band", "type": "Text" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "conditions": [ { "field": "tier", "operator": "Equals", "value": "A" } ] }, "then": { "band": "low" } }
            ],
            "otherwise": { "band": "high" }
          }
        }
        """;

        private static RuleResult Run(Dictionary<string, object?> inputs)
            => new RuleRuntimeService(new InMemoryMetadataResolver()).Execute(LegacyTierRule, inputs, Now);

        [Fact]
        public void Execute_LegacyTierRule_StillMatchesOnCallerTier()
            => Assert.Equal("low", Run(new Dictionary<string, object?> { ["tier"] = "A" }).Outputs["band"]);

        [Fact]
        public void Execute_LegacyRuleWithEmptyInput_IsNotRejected()
            => Assert.Equal("high", Run(new Dictionary<string, object?>()).Outputs["band"]);

        [Fact]
        public void Execute_LegacyRuleWithQuotedNumber_EvaluatesWithWarning()
        {
            var result = Run(new Dictionary<string, object?> { ["tier"] = "A", ["amount"] = "5000" });
            Assert.Equal(RuleOutcome.Matched, result.Outcome);
            Assert.Contains(result.Diagnostics, d => d.Code == "EDP062" && d.Severity == RuleErrorSeverity.Warning);
        }

        [Fact]
        public void Execute_LegacyRuleWithUnrepresentableNumber_FailsAsBefore()
            => Assert.Throws<FormatException>(() => Run(new Dictionary<string, object?> { ["amount"] = new Inputs.UnrepresentableNumber("1e400") }));

        [Fact]
        public void Execute_LegacyRuleWithExtraInput_EvaluatesWithNotice()
        {
            var result = Run(new Dictionary<string, object?> { ["tier"] = "A", ["other"] = 1m });
            Assert.Contains(result.Diagnostics, d => d.Code == "EDP067" && d.Severity == RuleErrorSeverity.Info);
        }

        [Fact]
        public void Execute_LegacyRule_ProducesNoErrorDiagnostics()
        {
            var result = Run(new Dictionary<string, object?> { ["tier"] = "A", ["amount"] = "text" });
            Assert.DoesNotContain(result.Diagnostics, d => d.Severity == RuleErrorSeverity.Error);
        }
    }
}

using System;
using System.Collections.Generic;
using EDP.RuleRuntime.Execution;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// The execution outcome contract: Outcome is authoritative and Success/Matched are derived,
    /// so no contradictory combination (e.g. Matched without Success) can be constructed.
    /// </summary>
    public class RuleOutcomeInvariantTests
    {
        private static readonly IReadOnlyDictionary<string, object?> NoOutputs = new Dictionary<string, object?>();
        private static readonly RuleDiagnostic[] OneError = { new RuleDiagnostic("EDP060", "missing") };

        public static IEnumerable<object[]> EveryOutcome() => new[]
        {
            new object[] { RuleResult.Ok(true, NoOutputs, new ExecutionTrace(), 1), RuleOutcome.Matched, true, true, "MATCHED" },
            new object[] { RuleResult.Ok(false, NoOutputs, new ExecutionTrace(), 1), RuleOutcome.NoMatch, true, false, "NO_MATCH" },
            new object[] { RuleResult.Rejected(OneError, new ExecutionTrace()), RuleOutcome.InputRejected, false, false, "INPUT_REJECTED" },
            new object[] { RuleResult.Failure(OneError, new ExecutionTrace(), 1), RuleOutcome.EngineError, false, false, "ENGINE_ERROR" },
        };

        [Theory]
        [MemberData(nameof(EveryOutcome))]
        public void Factory_EveryOutcome_HasConsistentDerivedFlags(RuleResult result, RuleOutcome outcome, bool success, bool matched, string wire)
        {
            Assert.Equal((outcome, success, matched, wire), (result.Outcome, result.Success, result.Matched, result.OutcomeCode));
        }

        [Theory]
        [MemberData(nameof(EveryOutcome))]
        public void Factory_EveryOutcome_MatchedImpliesSuccess(RuleResult result, RuleOutcome outcome, bool success, bool matched, string wire)
        {
            _ = (outcome, success, matched, wire);
            Assert.True(!result.Matched || result.Success);
        }

        [Fact]
        public void Rejected_HasNoOutputs()
            => Assert.Empty(RuleResult.Rejected(OneError, new ExecutionTrace()).Outputs);

        [Fact]
        public void WithAdditionalDiagnostics_KeepsTheOutcome()
        {
            var result = RuleResult.Ok(true, NoOutputs, new ExecutionTrace(), 1)
                .WithAdditionalDiagnostics(new[] { new RuleDiagnostic("EDP067", "ignored", RuleErrorSeverity.Info) });
            Assert.Equal(RuleOutcome.Matched, result.Outcome);
        }

        [Fact]
        public void ToWire_CoversEveryEnumValue()
        {
            foreach (RuleOutcome outcome in Enum.GetValues(typeof(RuleOutcome)))
                Assert.Matches("^[A-Z_]+$", RuleResult.ToWire(outcome));
        }
    }
}

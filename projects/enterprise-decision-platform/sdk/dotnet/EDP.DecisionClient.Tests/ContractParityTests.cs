using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Edp.DecisionClient;
using Xunit;

namespace Edp.DecisionClient.Tests
{
    /// <summary>IC-3: the SDK's copy of the shared contract values equals contract/rule-engine-contract.json.</summary>
    public class ContractParityTests
    {
        private static JsonElement Contract()
            => JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contract", "rule-engine-contract.json"))).RootElement;

        [Fact]
        public void RuleKeyPattern_EqualsTheContract()
            => Assert.Equal(Contract().GetProperty("ruleKey").GetProperty("pattern").GetString(), DecisionContract.RuleKeyPattern);

        [Fact]
        public void RuleKeyLengths_EqualTheContract()
        {
            var ruleKey = Contract().GetProperty("ruleKey");
            Assert.Equal((ruleKey.GetProperty("minLength").GetInt32(), ruleKey.GetProperty("maxLength").GetInt32()),
                (DecisionContract.RuleKeyMinLength, DecisionContract.RuleKeyMaxLength));
        }

        [Fact]
        public void CorrelationIdLengths_EqualTheContract()
        {
            var correlation = Contract().GetProperty("correlationId");
            Assert.Equal((correlation.GetProperty("minLength").GetInt32(), correlation.GetProperty("maxLength").GetInt32()),
                (DecisionContract.CorrelationIdMinLength, DecisionContract.CorrelationIdMaxLength));
        }

        [Fact]
        public void Outcomes_EqualTheContract()
        {
            var expected = Contract().GetProperty("outcomes").EnumerateArray().Select(o => o.GetString()).ToArray();
            Assert.Equal(expected, new[] { DecisionOutcome.Matched, DecisionOutcome.NoMatch, DecisionOutcome.InputRejected, DecisionOutcome.EngineError });
        }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// FR-B2-05: EDP066 refuses a DECLARED Lookup fact in a strict rule, not a record-bound one.
    /// A caller supplying a bound Lookup sends its reference id as a JSON string.
    /// </summary>
    public class StrictBoundLookupTests
    {
        private const string Rule = """
        { "schemaVersion": "1.1", "inputContract": "strict", "name": "Bound lookup",
          "inputs": [ { "name": "owner", "type": "Lookup", "binding": "ownerid" } ],
          "outputs": [ { "name": "o", "type": "Text" } ],
          "logic": { "type": "conditionSet",
            "rules": [ { "when": { "op": "and", "conditions": [ { "field": "owner", "operator": "Equals", "value": "3f2504e0-4f89-11d3-9a0c-0305e82c3301" } ] }, "then": { "o": "mine" } } ],
            "otherwise": { "o": "other" } } }
        """;

        private static RuleResult Run(object? owner)
            => new RuleRuntimeService(new InMemoryMetadataResolver())
                .Execute(Rule, new Dictionary<string, object?> { ["owner"] = owner }, new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc));

        [Fact]
        public void Execute_BoundLookupAsIdString_Evaluates()
            => Assert.Equal("mine", Run("3f2504e0-4f89-11d3-9a0c-0305e82c3301").Outputs["o"]);

        [Fact]
        public void Execute_BoundLookupAsNumber_IsRejectedWithEdp062()
            => Assert.Equal("EDP062", Run(42m).Diagnostics.First(d => d.Severity == RuleErrorSeverity.Error).Code);
    }
}

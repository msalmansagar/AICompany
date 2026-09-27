using System;
using System.Collections.Generic;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// A6 regression: membership of a numeric choice/code value in a JSON-array literal, evaluated
    /// end to end through a published-shape decision table.
    ///
    /// Before F1 (#96) the array literal reached the evaluator as its raw text "[100000002,
    /// 100000003]" and was split on commas, so the brackets defeated every match and the rule
    /// silently fell through to its default row. The live org still serves that behaviour on the
    /// signed 1.0.23 assembly until A7; these tests pin the fixed behaviour for every numeric
    /// representation a caller or a CRM record can supply.
    /// </summary>
    public class NumericMembershipRegressionTests
    {
        private const string Hit = "HIT";
        private const string Fallthrough = "DEFAULT";
        private const string OptionValues = "[100000002,100000003]";
        private static readonly DateTime Now = new DateTime(2026, 9, 27, 0, 0, 0, DateTimeKind.Utc);

        private static string Outcome(string op, string valueJson, object? input)
        {
            var metadata = new InMemoryMetadataResolver().AddAttribute("x_record", "x_code", FieldType.OptionSet);
            var pcrm = $$"""
            {
              "schemaVersion": "1.0", "ruleId": "a6", "name": "A6 numeric membership", "targetEntity": "x_record",
              "inputs": [ { "name": "code", "type": "OptionSet", "binding": "x_code" } ],
              "variables": [], "outputs": [ { "name": "o", "type": "Text" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First", "tableInputs": [ { "field": "code" } ], "outputColumns": [ "o" ],
                "rows": [ { "priority": 1, "cells": [ { "operator": "{{op}}", "value": {{valueJson}} } ], "outputs": { "o": "{{Hit}}" } } ],
                "defaultRow": { "priority": 9, "cells": [], "outputs": { "o": "{{Fallthrough}}" } } }
            }
            """;
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["code"] = input };
            return (string)new RuleRuntimeService(metadata).Execute(pcrm, inputs, Now).Outputs["o"]!;
        }

        [Fact] public void In_ClrInt32FromAnOptionSetRecord_Matches() => Assert.Equal(Hit, Outcome("In", OptionValues, 100000002));
        [Fact] public void In_ClrInt64_Matches() => Assert.Equal(Hit, Outcome("In", OptionValues, 100000002L));
        [Fact] public void In_ClrDouble_Matches() => Assert.Equal(Hit, Outcome("In", OptionValues, 100000002d));
        [Fact] public void In_ClrDecimal_Matches() => Assert.Equal(Hit, Outcome("In", OptionValues, 100000002m));
        [Fact] public void In_SecondElement_Matches() => Assert.Equal(Hit, Outcome("In", OptionValues, 100000003));
        [Fact] public void In_ValueNotInTheArray_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", OptionValues, 100000009));
        [Fact] public void In_DecimalLiteralInsideTheArray_MatchesAnInteger() => Assert.Equal(Hit, Outcome("In", "[100000002.0,100000003]", 100000002));
        [Fact] public void In_NegativeValue_Matches() => Assert.Equal(Hit, Outcome("In", "[-5,0,7]", -5));
        [Fact] public void In_FractionalValueAgainstIntegers_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", "[1,2]", 1.5m));
        [Fact] public void In_EmptyArray_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", "[]", 1));
        [Fact] public void In_CommaSeparatedStringLiteral_StillMatches() => Assert.Equal(Hit, Outcome("In", "\"100000002,100000003\"", 100000002));
        [Fact] public void In_NonNumericTextAgainstANumericArray_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", OptionValues, "abc"));
        [Fact] public void NotIn_ValuePresentInTheArray_FallsThrough() => Assert.Equal(Fallthrough, Outcome("NotIn", OptionValues, 100000002));
        [Fact] public void NotIn_ValueAbsentFromTheArray_Matches() => Assert.Equal(Hit, Outcome("NotIn", OptionValues, 100000009));
    }
}

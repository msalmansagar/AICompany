using System;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// A6 regression on the path the live defect was reported through: an EvaluateDecision caller
    /// sends InputsJson, RuleDecisionService.ParseInputsJson types the values, and the rule tests
    /// membership in a JSON-array literal. The live probe on the signed 1.0.23 assembly returned
    /// the default row for `bucket: 100000002` against [100000002, 100000003]; these pin the fix.
    /// </summary>
    public class InputsJsonNumericMembershipTests
    {
        private const string Hit = "HIT";
        private const string Fallthrough = "DEFAULT";
        private static readonly DateTime Now = new DateTime(2026, 9, 27, 0, 0, 0, DateTimeKind.Utc);

        private static string Outcome(string op, string inputsJson)
        {
            var metadata = new InMemoryMetadataResolver().AddAttribute("x_record", "x_code", FieldType.OptionSet);
            var pcrm = $$"""
            {
              "schemaVersion": "1.0", "ruleId": "a6", "name": "A6 numeric membership", "targetEntity": "x_record",
              "inputs": [ { "name": "bucket", "type": "OptionSet", "binding": "x_code" } ],
              "variables": [], "outputs": [ { "name": "o", "type": "Text" } ],
              "logic": { "type": "decisionTable", "hitPolicy": "First", "tableInputs": [ { "field": "bucket" } ], "outputColumns": [ "o" ],
                "rows": [ { "priority": 1, "cells": [ { "operator": "{{op}}", "value": [100000002, 100000003] } ], "outputs": { "o": "{{Hit}}" } } ],
                "defaultRow": { "priority": 9, "cells": [], "outputs": { "o": "{{Fallthrough}}" } } }
            }
            """;
            var inputs = RuleDecisionService.ParseInputsJson(inputsJson);
            return (string)new RuleRuntimeService(metadata).Execute(pcrm, inputs, Now).Outputs["o"]!;
        }

        [Fact] public void ParseInputsJson_JsonIntegerInTheArray_Matches() => Assert.Equal(Hit, Outcome("In", "{\"bucket\": 100000002}"));
        [Fact] public void ParseInputsJson_JsonDecimalFormPointZero_Matches() => Assert.Equal(Hit, Outcome("In", "{\"bucket\": 100000002.0}"));
        [Fact] public void ParseInputsJson_NumericString_Matches() => Assert.Equal(Hit, Outcome("In", "{\"bucket\": \"100000002\"}"));
        [Fact] public void ParseInputsJson_JsonIntegerNotInTheArray_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", "{\"bucket\": 100000009}"));
        [Fact] public void ParseInputsJson_NonNumericString_FallsThrough() => Assert.Equal(Fallthrough, Outcome("In", "{\"bucket\": \"abc\"}"));
        [Fact] public void ParseInputsJson_NotInWithTheValuePresent_FallsThrough() => Assert.Equal(Fallthrough, Outcome("NotIn", "{\"bucket\": 100000002}"));
        [Fact] public void ParseInputsJson_NotInWithTheValueAbsent_Matches() => Assert.Equal(Hit, Outcome("NotIn", "{\"bucket\": 100000009}"));
    }
}

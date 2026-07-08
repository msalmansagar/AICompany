using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace EDP.RuleRuntime.Pcrm
{
    /// <summary>
    /// Platform Canonical Rule Model — the runtime's ONLY input format. Produced by
    /// the Rule Translator from GoRules JSON; the runtime never sees GoRules/ZEN.
    /// This is the v1.0 shape for the Horizon-1 slice (condition sets + decision tables).
    /// </summary>
    public sealed class PcrmDocument
    {
        [JsonPropertyName("schemaVersion")] public string SchemaVersion { get; set; } = "1.0";
        [JsonPropertyName("ruleId")] public string RuleId { get; set; } = "";
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("targetEntity")] public string TargetEntity { get; set; } = "";
        [JsonPropertyName("inputs")] public List<PcrmInput> Inputs { get; set; } = new List<PcrmInput>();
        [JsonPropertyName("variables")] public List<PcrmVariable> Variables { get; set; } = new List<PcrmVariable>();
        [JsonPropertyName("outputs")] public List<PcrmOutput> Outputs { get; set; } = new List<PcrmOutput>();
        [JsonPropertyName("logic")] public PcrmLogic Logic { get; set; } = new PcrmLogic();
    }

    public sealed class PcrmInput
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "Text";
        [JsonPropertyName("binding")] public string? Binding { get; set; }
    }

    public sealed class PcrmVariable
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "Text";
        [JsonPropertyName("formula")] public string Formula { get; set; } = "";
    }

    public sealed class PcrmOutput
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "Text";
    }

    /// <summary>logic.type is either "conditionSet" or "decisionTable".</summary>
    public sealed class PcrmLogic
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "conditionSet";

        // conditionSet
        [JsonPropertyName("rules")] public List<PcrmConditionRule> Rules { get; set; } = new List<PcrmConditionRule>();
        [JsonPropertyName("otherwise")] public Dictionary<string, JsonElement>? Otherwise { get; set; }

        // decisionTable
        [JsonPropertyName("hitPolicy")] public string HitPolicy { get; set; } = "First";
        [JsonPropertyName("tableInputs")] public List<PcrmTableInput> TableInputs { get; set; } = new List<PcrmTableInput>();
        [JsonPropertyName("outputColumns")] public List<string> OutputColumns { get; set; } = new List<string>();
        [JsonPropertyName("rows")] public List<PcrmTableRow> Rows { get; set; } = new List<PcrmTableRow>();
        [JsonPropertyName("defaultRow")] public PcrmTableRow? DefaultRow { get; set; }
    }

    public sealed class PcrmConditionRule
    {
        [JsonPropertyName("when")] public PcrmGroup When { get; set; } = new PcrmGroup();
        [JsonPropertyName("then")] public Dictionary<string, JsonElement> Then { get; set; } = new Dictionary<string, JsonElement>();
    }

    /// <summary>A boolean group: AND/OR (optionally negated) over conditions and nested groups.</summary>
    public sealed class PcrmGroup
    {
        [JsonPropertyName("op")] public string Op { get; set; } = "and"; // and | or
        [JsonPropertyName("negate")] public bool Negate { get; set; }
        [JsonPropertyName("conditions")] public List<PcrmCondition> Conditions { get; set; } = new List<PcrmCondition>();
        [JsonPropertyName("groups")] public List<PcrmGroup> Groups { get; set; } = new List<PcrmGroup>();
    }

    public sealed class PcrmCondition
    {
        /// <summary>Left operand: an input/variable name.</summary>
        [JsonPropertyName("field")] public string Field { get; set; } = "";
        [JsonPropertyName("operator")] public string Operator { get; set; } = "Equals";
        [JsonPropertyName("value")] public JsonElement Value { get; set; }
        /// <summary>Second operand for Between.</summary>
        [JsonPropertyName("value2")] public JsonElement Value2 { get; set; }
        /// <summary>When set, the right operand is another field/input, resolved at eval time (field-to-field).</summary>
        [JsonPropertyName("valueField")] public string? ValueField { get; set; }
        /// <summary>Field reference for the Between second operand.</summary>
        [JsonPropertyName("value2Field")] public string? Value2Field { get; set; }
    }

    public sealed class PcrmTableInput
    {
        [JsonPropertyName("field")] public string Field { get; set; } = "";
    }

    public sealed class PcrmTableRow
    {
        [JsonPropertyName("priority")] public int Priority { get; set; }
        /// <summary>One cell per table input, in order.</summary>
        [JsonPropertyName("cells")] public List<PcrmCell> Cells { get; set; } = new List<PcrmCell>();
        [JsonPropertyName("outputs")] public Dictionary<string, JsonElement> Outputs { get; set; } = new Dictionary<string, JsonElement>();
    }

    /// <summary>A decision-table cell = a unary test (operator + value) against its column input.</summary>
    public sealed class PcrmCell
    {
        [JsonPropertyName("operator")] public string Operator { get; set; } = "Equals";
        [JsonPropertyName("value")] public JsonElement Value { get; set; }
        [JsonPropertyName("value2")] public JsonElement Value2 { get; set; }
        /// <summary>When set, the right operand is another field/input, resolved at eval time (field-to-field).</summary>
        [JsonPropertyName("valueField")] public string? ValueField { get; set; }
        /// <summary>Field reference for the Between second operand.</summary>
        [JsonPropertyName("value2Field")] public string? Value2Field { get; set; }
        /// <summary>Wildcard cell — matches anything (a "-" in the table).</summary>
        [JsonPropertyName("any")] public bool Any { get; set; }
    }
}

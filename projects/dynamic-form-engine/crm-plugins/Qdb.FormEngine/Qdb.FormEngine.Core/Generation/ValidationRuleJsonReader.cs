using Newtonsoft.Json.Linq;
using Qdb.FormEngine.Core.Models;
using System.Collections.Generic;
using System.Linq;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Reads the structured payload the designer stores in qdb_form_validation_rule.qdb_rule_json
    /// (schema version 2): the conditions of a conditional-required rule, or the operator and
    /// target of a cross-field rule.
    /// </summary>
    /// <remarks>
    /// Mirrors shared/src/validation/ruleJsonCodec.ts. The designer wrote this column for months
    /// while neither publisher read it, so both rule kinds saved and then never reached a form.
    /// A payload that is absent, malformed or of another version leaves the rule untouched.
    /// </remarks>
    public static class ValidationRuleJsonReader
    {
        private const int SupportedSchemaVersion = 2;

        /// <summary>Applies the payload's structured fields to <paramref name="rule"/>.</summary>
        public static void Apply(ValidationRule rule, string ruleJson)
        {
            var payload = Parse(ruleJson);
            if (payload == null) return;

            var type = (string)payload["type"];
            if (type == "conditional_required") rule.Conditions = ReadConditions(payload["conditions"] as JArray);
            else if (type == "cross_field") ApplyCrossField(rule, payload);
            else if (type == "api_validation") ApplyApiValidation(rule, payload);
        }

        /// <summary>DFE-APIVAL-CAM-001: a blank key names no check, so it is not published.</summary>
        private static void ApplyApiValidation(ValidationRule rule, JObject payload)
        {
            var key = ((string)payload["key"] ?? string.Empty).Trim();
            if (key.Length > 0) rule.ValidationKey = key;
        }

        private static JObject Parse(string ruleJson)
        {
            if (string.IsNullOrWhiteSpace(ruleJson)) return null;
            try
            {
                var payload = JToken.Parse(ruleJson) as JObject;
                if (payload == null) return null;
                return (int?)payload["schemaVersion"] == SupportedSchemaVersion ? payload : null;
            }
            catch (Newtonsoft.Json.JsonException)
            {
                return null;
            }
        }

        private static void ApplyCrossField(ValidationRule rule, JObject payload)
        {
            rule.CrossFieldOperator = (string)payload["operator"] ?? "==";
            rule.CrossFieldTargetRef = (string)payload["targetFieldRef"] ?? string.Empty;
        }

        private static List<StructuredCondition> ReadConditions(JArray conditions)
        {
            if (conditions == null) return new List<StructuredCondition>();
            return conditions
                .OfType<JObject>()
                .Select(condition => new StructuredCondition
                {
                    FieldRef = (string)condition["fieldRef"],
                    Operator = (string)condition["operator"],
                    Value = condition["value"] == null || condition["value"].Type == JTokenType.Null
                        ? null
                        : (string)condition["value"]
                })
                .ToList();
        }
    }
}

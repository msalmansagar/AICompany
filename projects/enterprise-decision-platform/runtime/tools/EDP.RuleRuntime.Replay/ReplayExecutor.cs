using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using EDP.RuleRuntime.Execution;

namespace EDP.RuleRuntime.Replay
{
    /// <summary>
    /// Runs one replay case and reduces the result to what TC-3 compares: whether the rule compiled
    /// and ran, success, match, outputs and reason codes. Diagnostics are deliberately excluded:
    /// 1.1.0 adds warnings and notices to lenient rules without changing their decision.
    /// This file compiles against the baseline engine too, so it uses only the pre-1.1 API.
    /// </summary>
    public static class ReplayExecutor
    {
        /// <summary>The fixed clock every replay runs at, so Today()-style formulas are reproducible.</summary>
        public static readonly DateTime ReplayNowUtc = new DateTime(2026, 9, 28, 0, 0, 0, DateTimeKind.Utc);

        public static JsonObject Run(RuleRuntimeService runtime, string pcrmJson, JsonObject inputs)
        {
            try
            {
                var result = runtime.Execute(pcrmJson, ToRuntimeInputs(inputs), ReplayNowUtc);
                return Completed(result);
            }
            catch (RuleCompilationException ex)
            {
                var codes = ex.Diagnostics.Where(d => d.Severity == RuleErrorSeverity.Error).Select(d => d.Code).OrderBy(c => c, StringComparer.Ordinal);
                return new JsonObject { ["status"] = "compile-error", ["codes"] = new JsonArray(codes.Select(c => (JsonNode?)c).ToArray()) };
            }
            catch (Exception ex)
            {
                return new JsonObject { ["status"] = "exception", ["type"] = ex.GetType().Name };
            }
        }

        private static JsonObject Completed(RuleResult result) => new JsonObject
        {
            ["status"] = "ran",
            ["success"] = result.Success,
            ["matched"] = result.Matched,
            ["outputs"] = SortedOutputs(result.Outputs),
            ["reasonCodes"] = new JsonArray(result.ReasonCodes.Select(c => (JsonNode?)c).ToArray()),
        };

        private static JsonObject SortedOutputs(IReadOnlyDictionary<string, object?> outputs)
        {
            var sorted = new JsonObject();
            foreach (var output in outputs.OrderBy(o => o.Key, StringComparer.Ordinal))
                sorted[output.Key] = JsonSerializer.SerializeToNode(output.Value);
            return sorted;
        }

        /// <summary>The same conversion the CRM InputsJson path applies: numbers as decimal, arrays as lists.</summary>
        public static IDictionary<string, object?> ToRuntimeInputs(JsonObject inputs)
            => inputs.ToDictionary(p => p.Key, p => ToRuntime(p.Value), StringComparer.OrdinalIgnoreCase);

        private static object? ToRuntime(JsonNode? node)
        {
            switch (node)
            {
                case null: return null;
                case JsonArray array: return array.Select(ToRuntime).ToList();
                case JsonObject obj: return obj.ToDictionary(p => p.Key, p => ToRuntime(p.Value), StringComparer.OrdinalIgnoreCase);
                default: return ScalarOf(node.AsValue());
            }
        }

        private static object? ScalarOf(JsonValue value)
        {
            if (value.TryGetValue<bool>(out var flag)) return flag;
            if (value.TryGetValue<decimal>(out var number)) return number;
            return value.GetValue<string>();
        }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace EDP.RuleRuntime.Scenarios
{
    /// <summary>A single stored scenario: named inputs and the outputs they are expected to produce.</summary>
    public sealed class Scenario
    {
        public string Name { get; set; } = "";
        public IDictionary<string, object?> Inputs { get; set; } = new Dictionary<string, object?>();
        public IReadOnlyDictionary<string, JsonElement> Expected { get; set; } = new Dictionary<string, JsonElement>();
    }

    /// <summary>The verdict for one scenario after running it against a rule.</summary>
    public sealed class ScenarioOutcome
    {
        public string Name { get; set; } = "";
        public bool Passed { get; set; }
        public IReadOnlyList<string> Mismatches { get; set; } = new List<string>();
        public IReadOnlyDictionary<string, object?> Actual { get; set; } = new Dictionary<string, object?>();
        public string? Error { get; set; }
    }

    /// <summary>Aggregate result of running a scenario suite.</summary>
    public sealed class ScenarioRunSummary
    {
        public List<ScenarioOutcome> Results { get; } = new List<ScenarioOutcome>();
        public int Total => Results.Count;
        public int Passed => Results.Count(r => r.Passed);
        public int Failed => Results.Count(r => !r.Passed);
        public bool AllPassed => Failed == 0;
    }

    /// <summary>
    /// Runs a suite of stored scenarios against a PCRM payload using the runtime and compares each
    /// scenario's outputs to its expectations. CRM-free (takes a <see cref="RuleRuntimeService"/> and
    /// raw scenario JSON), so it drives both the RunScenarios Custom API and the pre-publish gate.
    /// </summary>
    public static class ScenarioRunner
    {
        private static readonly JsonSerializerOptions Options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        public static ScenarioRunSummary Run(string? scenariosJson, string pcrmJson, RuleRuntimeService runtime, DateTime nowUtc)
        {
            if (runtime == null) throw new ArgumentNullException(nameof(runtime));
            var summary = new ScenarioRunSummary();
            foreach (var scenario in Parse(scenariosJson))
                summary.Results.Add(RunOne(scenario, pcrmJson, runtime, nowUtc));
            return summary;
        }

        private static ScenarioOutcome RunOne(Scenario scenario, string pcrmJson, RuleRuntimeService runtime, DateTime nowUtc)
        {
            var outcome = new ScenarioOutcome { Name = scenario.Name };
            try
            {
                var result = runtime.TestRule(pcrmJson, scenario.Inputs, nowUtc);
                outcome.Actual = result.Outputs;
                if (!result.Success)
                {
                    outcome.Passed = false;
                    outcome.Error = result.Diagnostics.Count > 0
                        ? string.Join("; ", result.Diagnostics.Select(d => $"{d.Code} {d.Message}"))
                        : "rule did not execute";
                    return outcome;
                }
                outcome.Mismatches = ScenarioComparer.Compare(scenario.Expected, result.Outputs);
                outcome.Passed = outcome.Mismatches.Count == 0;
            }
            catch (Exception ex)
            {
                outcome.Passed = false;
                outcome.Error = ex.Message;
            }
            return outcome;
        }

        /// <summary>Parse a <c>[{ name, inputs:{}, expected:{} }]</c> array; malformed entries are skipped.</summary>
        public static IReadOnlyList<Scenario> Parse(string? scenariosJson)
        {
            var list = new List<Scenario>();
            if (string.IsNullOrWhiteSpace(scenariosJson)) return list;

            using var doc = JsonDocument.Parse(scenariosJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return list;

            foreach (var element in doc.RootElement.EnumerateArray())
            {
                if (element.ValueKind != JsonValueKind.Object) continue;
                list.Add(new Scenario
                {
                    Name = element.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()! : "(unnamed)",
                    Inputs = ReadInputs(element),
                    Expected = ReadObject(element, "expected")
                });
            }
            return list;
        }

        private static IDictionary<string, object?> ReadInputs(JsonElement scenario)
        {
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in ReadObject(scenario, "inputs"))
                inputs[kv.Key] = ToClrValue(kv.Value);
            return inputs;
        }

        private static IReadOnlyDictionary<string, JsonElement> ReadObject(JsonElement parent, string property)
        {
            var map = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
            if (parent.TryGetProperty(property, out var obj) && obj.ValueKind == JsonValueKind.Object)
                foreach (var p in obj.EnumerateObject())
                    map[p.Name] = p.Value.Clone(); // Clone so it survives disposal of the JsonDocument
            return map;
        }

        private static object? ToClrValue(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.String: return e.GetString();
                case JsonValueKind.Number: return e.TryGetDecimal(out var d) ? d : (object)e.GetDouble();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                case JsonValueKind.Null: return null;
                default: return e.GetRawText();
            }
        }
    }
}

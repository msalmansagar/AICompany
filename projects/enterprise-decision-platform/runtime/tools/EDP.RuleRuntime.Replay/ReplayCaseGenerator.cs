using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;

namespace EDP.RuleRuntime.Replay
{
    /// <summary>
    /// Deterministic input sets for one rule (TC-3). Candidates for each input come from the rule's
    /// own condition and cell literals (each literal, one either side of it, and null), so every
    /// branch boundary the rule declares is exercised. Same PCRM in, same cases out, in the same order.
    /// </summary>
    public static class ReplayCaseGenerator
    {
        private const int MaxLiteralsPerKind = 8;
        private const int MaxCartesianCases = 400;
        private static readonly string[] NumericTypes = { "Decimal", "Currency", "Money", "WholeNumber", "Integer", "Number", "Double", "OptionSet", "Choice" };
        private static readonly string[] BooleanTypes = { "Boolean", "TwoOptions" };

        public static IReadOnlyList<JsonObject> InputSetsFor(string pcrmJson)
        {
            var pcrm = JsonNode.Parse(pcrmJson)!.AsObject();
            var inputs = (pcrm["inputs"] as JsonArray ?? new JsonArray()).OfType<JsonObject>()
                .Select(i => (Name: (string)i["name"]!, Type: (string?)i["type"] ?? "Text")).ToList();
            var literals = LiteralsIn(pcrm["logic"]);
            var candidates = inputs.ToDictionary(i => i.Name, i => CandidatesFor(i.Type, literals));
            return Distinct(Cases(inputs.Select(i => i.Name).ToList(), candidates));
        }

        private static IEnumerable<JsonObject> Cases(List<string> names, Dictionary<string, List<JsonNode?>> candidates)
        {
            if (names.Count == 0) { yield return new JsonObject(); yield break; }
            var baseline = names.ToDictionary(n => n, n => candidates[n].FirstOrDefault(c => c != null));
            yield return Build(names, n => baseline[n]);
            yield return Build(names, _ => null);
            foreach (var name in names)
                foreach (var candidate in candidates[name])
                    yield return Build(names, n => n == name ? candidate : baseline[n]);
            foreach (var combination in Cartesian(names, candidates))
                yield return combination;
        }

        /// <summary>Every combination, when small enough to be worth it (rules with few inputs).</summary>
        private static IEnumerable<JsonObject> Cartesian(List<string> names, Dictionary<string, List<JsonNode?>> candidates)
        {
            var total = names.Aggregate(1L, (product, n) => product * Math.Max(1, candidates[n].Count));
            if (total > MaxCartesianCases) yield break;
            var indexes = new int[names.Count];
            for (var emitted = 0L; emitted < total; emitted++)
            {
                yield return Build(names, n => candidates[n].Count == 0 ? null : candidates[n][indexes[names.IndexOf(n)]]);
                Advance(indexes, names.Select(n => Math.Max(1, candidates[n].Count)).ToArray());
            }
        }

        private static void Advance(int[] indexes, int[] sizes)
        {
            for (var position = indexes.Length - 1; position >= 0; position--)
            {
                if (++indexes[position] < sizes[position]) return;
                indexes[position] = 0;
            }
        }

        private static JsonObject Build(List<string> names, Func<string, JsonNode?> valueOf)
        {
            var set = new JsonObject();
            foreach (var name in names) set[name] = valueOf(name)?.DeepClone();
            return set;
        }

        private static IReadOnlyList<JsonObject> Distinct(IEnumerable<JsonObject> sets)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            return sets.Where(s => seen.Add(s.ToJsonString())).ToList();
        }

        private static List<JsonNode?> CandidatesFor(string type, Literals literals)
        {
            if (NumericTypes.Contains(type, StringComparer.OrdinalIgnoreCase)) return NumericCandidates(literals.Numbers);
            if (BooleanTypes.Contains(type, StringComparer.OrdinalIgnoreCase)) return new List<JsonNode?> { true, false, null };
            if (type.Equals("Collection", StringComparison.OrdinalIgnoreCase)) return new List<JsonNode?> { new JsonArray(), null };
            return TextCandidates(literals);
        }

        private static List<JsonNode?> NumericCandidates(IReadOnlyList<decimal> numbers)
        {
            var values = numbers.SelectMany(n => new[] { n, n - 1, n + 1 }).Append(0m).Distinct().OrderBy(n => n);
            return values.Select(v => (JsonNode?)JsonValue.Create(v)).Append(null).ToList();
        }

        private static List<JsonNode?> TextCandidates(Literals literals)
        {
            var values = literals.Strings.Select(s => (JsonNode?)JsonValue.Create(s))
                .Append(JsonValue.Create("zz-unmatched")).Append(JsonValue.Create(""));
            var numbers = literals.Numbers.Select(n => (JsonNode?)JsonValue.Create(n));
            return values.Concat(numbers).Append(null).ToList();
        }

        private sealed class Literals
        {
            public List<decimal> Numbers { get; } = new List<decimal>();
            public List<string> Strings { get; } = new List<string>();
        }

        /// <summary>The values conditions and cells compare against ("value", "value2"), in document order.</summary>
        private static Literals LiteralsIn(JsonNode? logic)
        {
            var literals = new Literals();
            Collect(logic, literals, isComparedValue: false);
            Trim(literals.Numbers);
            Trim(literals.Strings);
            return literals;
        }

        private static void Trim<T>(List<T> values)
        {
            var distinct = values.Distinct().Take(MaxLiteralsPerKind).ToList();
            values.Clear();
            values.AddRange(distinct);
        }

        private static void Collect(JsonNode? node, Literals literals, bool isComparedValue)
        {
            switch (node)
            {
                case JsonObject obj:
                    foreach (var property in obj)
                        Collect(property.Value, literals, property.Key == "value" || property.Key == "value2");
                    break;
                case JsonArray array:
                    foreach (var item in array) Collect(item, literals, isComparedValue);
                    break;
                case JsonValue value when isComparedValue:
                    AddLiteral(value, literals);
                    break;
            }
        }

        private static void AddLiteral(JsonValue value, Literals literals)
        {
            if (value.TryGetValue<decimal>(out var number)) literals.Numbers.Add(number);
            else if (value.TryGetValue<string>(out var text))
            {
                literals.Strings.Add(text);
                if (decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)) literals.Numbers.Add(parsed);
            }
        }
    }
}

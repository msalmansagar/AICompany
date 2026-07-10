using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace EDP.RuleRuntime.Scenarios
{
    /// <summary>
    /// Compares a scenario's EXPECTED outputs against the runtime's ACTUAL outputs. Pure and
    /// CRM-free so it can be unit-tested directly. Only the keys named in <c>expected</c> are
    /// asserted — extra actual outputs are ignored (a scenario asserts a subset). Values are
    /// normalized to an invariant string on both sides so that <c>500000</c> vs <c>500000.0</c>,
    /// <c>True</c> vs <c>true</c>, and quoted/unquoted numbers compare equal.
    /// </summary>
    public static class ScenarioComparer
    {
        /// <summary>Returns one human-readable message per mismatched output key; empty = the scenario passes.</summary>
        public static IReadOnlyList<string> Compare(
            IReadOnlyDictionary<string, JsonElement> expected,
            IReadOnlyDictionary<string, object?> actual)
        {
            if (expected == null) throw new ArgumentNullException(nameof(expected));
            if (actual == null) throw new ArgumentNullException(nameof(actual));

            var mismatches = new List<string>();
            foreach (var kv in expected)
            {
                var want = NormalizeExpected(kv.Value);
                if (!actual.TryGetValue(kv.Key, out var actualValue))
                {
                    mismatches.Add($"{kv.Key}: expected '{want}' but the rule produced no such output.");
                    continue;
                }
                var got = NormalizeActual(actualValue);
                if (!string.Equals(want, got, StringComparison.Ordinal))
                    mismatches.Add($"{kv.Key}: expected '{want}', got '{got}'.");
            }
            return mismatches;
        }

        private static string NormalizeExpected(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.Null: return NullToken;
                case JsonValueKind.True: return "true";
                case JsonValueKind.False: return "false";
                case JsonValueKind.Number: return NormalizeNumberText(e.GetRawText());
                case JsonValueKind.String:
                    var s = e.GetString() ?? "";
                    return LooksNumeric(s) ? NormalizeNumberText(s) : s;
                default: return e.GetRawText();
            }
        }

        private static string NormalizeActual(object? value)
        {
            switch (value)
            {
                case null: return NullToken;
                case bool b: return b ? "true" : "false";
                case string s: return LooksNumeric(s) ? NormalizeNumberText(s) : s;
                case JsonElement je: return NormalizeExpected(je);
                case IFormattable f when IsNumeric(value):
                    return NormalizeNumberText(f.ToString(null, CultureInfo.InvariantCulture));
                case DateTime dt: return dt.ToString("o", CultureInfo.InvariantCulture);
                default: return Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
            }
        }

        // Canonicalize a numeric literal: drop trailing zeros / a bare decimal point so
        // "500000", "500000.0", and "500000.00" all normalize to the same token.
        private static string NormalizeNumberText(string raw)
        {
            if (!decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var d))
                return raw.Trim();
            var normalized = d.ToString("0.############################", CultureInfo.InvariantCulture);
            return normalized.Length == 0 ? "0" : normalized;
        }

        private static bool LooksNumeric(string s)
            => decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out _);

        private static bool IsNumeric(object v)
            => v is byte || v is sbyte || v is short || v is ushort || v is int || v is uint
               || v is long || v is ulong || v is float || v is double || v is decimal;

        private const string NullToken = "∅"; // ∅ — an unambiguous stand-in for a null output
    }
}

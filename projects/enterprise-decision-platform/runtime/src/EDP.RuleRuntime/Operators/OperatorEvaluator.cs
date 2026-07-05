using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace EDP.RuleRuntime.Operators
{
    /// <summary>
    /// The 21 EDP-H1 comparison operators. Pure and deterministic: given the same
    /// operands it always returns the same result. Left is the field/variable value;
    /// right is the literal from the PCRM condition.
    /// </summary>
    public static class OperatorEvaluator
    {
        public static bool Evaluate(string op, object? left, object? right, object? right2 = null)
        {
            switch (Normalize(op))
            {
                case "equals": return Eq(left, right);
                case "notequals": return !Eq(left, right);
                case "greaterthan": return Cmp(left, right, c => c > 0);
                case "greaterthanorequal": return Cmp(left, right, c => c >= 0);
                case "lessthan": return Cmp(left, right, c => c < 0);
                case "lessthanorequal": return Cmp(left, right, c => c <= 0);

                case "contains": return Str(left).IndexOf(Str(right), StringComparison.OrdinalIgnoreCase) >= 0;
                case "notcontains": return Str(left).IndexOf(Str(right), StringComparison.OrdinalIgnoreCase) < 0;
                case "startswith": return Str(left).StartsWith(Str(right), StringComparison.OrdinalIgnoreCase);
                case "endswith": return Str(left).EndsWith(Str(right), StringComparison.OrdinalIgnoreCase);

                case "in": return InList(left, right);
                case "notin": return !InList(left, right);

                case "between": return Cmp(left, right, c => c >= 0) && Cmp(left, right2, c => c <= 0);

                case "isnull": return RuntimeValue.IsNullOrEmpty(left);
                case "isnotnull": return !RuntimeValue.IsNullOrEmpty(left);
                case "isempty": return RuntimeValue.IsNullOrEmpty(left);
                case "isnotempty": return !RuntimeValue.IsNullOrEmpty(left);

                // date operators — semantics identical to comparisons but named for clarity
                case "before": return Cmp(left, right, c => c < 0);
                case "after": return Cmp(left, right, c => c > 0);
                case "on": return Eq(left, right);
                case "onorbefore": return Cmp(left, right, c => c <= 0);
                case "onorafter": return Cmp(left, right, c => c >= 0);

                default:
                    throw new NotSupportedException($"Unsupported operator '{op}'.");
            }
        }

        public static bool IsKnown(string op) => KnownOps.Contains(Normalize(op));

        private static readonly HashSet<string> KnownOps = new HashSet<string>(new[]
        {
            "equals","notequals","greaterthan","greaterthanorequal","lessthan","lessthanorequal",
            "contains","notcontains","startswith","endswith","in","notin","between",
            "isnull","isnotnull","isempty","isnotempty","before","after","on","onorbefore","onorafter"
        });

        private static string Normalize(string op) => op.Replace("_", string.Empty).Replace(" ", string.Empty).ToLowerInvariant();

        private static bool Eq(object? a, object? b)
        {
            if (RuntimeValue.IsNullOrEmpty(a) && RuntimeValue.IsNullOrEmpty(b)) return true;
            var cmp = RuntimeValue.Compare(a, b);
            return cmp.HasValue && cmp.Value == 0;
        }

        private static bool Cmp(object? a, object? b, Func<int, bool> pred)
        {
            var cmp = RuntimeValue.Compare(a, b);
            return cmp.HasValue && pred(cmp.Value);
        }

        private static string Str(object? v) => RuntimeValue.AsString(v);

        private static bool InList(object? left, object? right)
        {
            if (right is System.Text.Json.JsonElement je && je.ValueKind == System.Text.Json.JsonValueKind.Array)
                return je.EnumerateArray().Any(item => Eq(left, RuntimeValue.FromJson(item)));
            if (right is IEnumerable<object?> list)
                return list.Any(item => Eq(left, item));
            // comma-separated fallback
            return Str(right).Split(',').Select(s => s.Trim()).Any(s => string.Equals(s, Str(left), StringComparison.OrdinalIgnoreCase));
        }
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;

namespace EDP.RuleRuntime.Operators
{
    /// <summary>
    /// Normalises PCRM/JSON and CRM values to a small deterministic set:
    /// decimal (all numerics), DateTime (UTC), bool, string. All culture-sensitive
    /// operations use InvariantCulture; all dates are UTC (EDP-H1 determinism rules).
    /// </summary>
    public static class RuntimeValue
    {
        public static object? FromJson(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.String:
                    var s = e.GetString();
                    if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
                        return dt;
                    return s;
                case JsonValueKind.Number:
                    return e.GetDecimal();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return null;
                case JsonValueKind.Array:
                    return ToCollection(e);
                case JsonValueKind.Object:
                    return ToRecord(e);
                default:
                    return e.GetRawText();
            }
        }

        /// <summary>
        /// A JSON array becomes an ordered collection of runtime values. Before F1 this
        /// returned the array's raw text, which made collections unreachable to quantifiers
        /// and to the In operator alike.
        /// </summary>
        public static IReadOnlyList<object?> ToCollection(JsonElement array)
        {
            var items = new List<object?>();
            foreach (var item in array.EnumerateArray()) items.Add(FromJson(item));
            return items;
        }

        /// <summary>
        /// A JSON object becomes a field-addressable record, so a quantifier body can compare
        /// an element's fields by name. Field lookup is case-insensitive, matching how the
        /// execution context resolves every other symbol.
        /// </summary>
        public static IReadOnlyDictionary<string, object?> ToRecord(JsonElement obj)
        {
            var record = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var property in obj.EnumerateObject()) record[property.Name] = FromJson(property.Value);
            return record;
        }

        /// <summary>A collection is any enumerable that is not a string (a string enumerates characters).</summary>
        public static bool IsCollection(object? value)
            => value is System.Collections.IEnumerable && !(value is string) && !(value is IReadOnlyDictionary<string, object?>);

        /// <summary>
        /// Enumerate a value as a collection. A non-collection yields nothing rather than
        /// throwing: the quantifier records that it saw no elements, which is visible in the
        /// trace, instead of failing an entire decision on one mistyped input.
        /// </summary>
        public static IEnumerable<object?> AsCollection(object? value)
        {
            if (!IsCollection(value)) return System.Linq.Enumerable.Empty<object?>();
            return System.Linq.Enumerable.Cast<object?>((System.Collections.IEnumerable)value!);
        }

        public static bool IsNullOrEmpty(object? v)
            => v == null
               || (v is string s && s.Length == 0)
               || (IsCollection(v) && !System.Linq.Enumerable.Any(AsCollection(v)));

        public static decimal? AsDecimal(object? v)
        {
            switch (v)
            {
                case null: return null;
                case decimal d: return d;
                case int i: return i;
                case long l: return l;
                case double db: return (decimal)db;
                case bool b: return b ? 1 : 0;
                case string s when decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var r): return r;
                default: return null;
            }
        }

        public static DateTime? AsDate(object? v)
        {
            switch (v)
            {
                case null: return null;
                case DateTime dt: return dt.ToUniversalTime();
                case string s when DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var r): return r;
                default: return null;
            }
        }

        public static string AsString(object? v)
        {
            switch (v)
            {
                case null: return string.Empty;
                case string s: return s;
                case decimal d: return d.ToString(CultureInfo.InvariantCulture);
                case DateTime dt: return dt.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
                case bool b: return b ? "true" : "false";
                default: return Convert.ToString(v, CultureInfo.InvariantCulture) ?? string.Empty;
            }
        }

        /// <summary>
        /// Three-way compare with type coercion: numbers, then dates, then invariant
        /// string ordinal. Returns null when the operands are not comparable.
        /// </summary>
        public static int? Compare(object? a, object? b)
        {
            var da = AsDecimal(a); var db = AsDecimal(b);
            if (da.HasValue && db.HasValue) return decimal.Compare(da.Value, db.Value);

            var ta = AsDate(a); var tb = AsDate(b);
            if (ta.HasValue && tb.HasValue) return DateTime.Compare(ta.Value, tb.Value);

            if (a is bool ba && b is bool bb) return ba.CompareTo(bb);

            if (a != null && b != null)
                return string.Compare(AsString(a), AsString(b), StringComparison.Ordinal);

            return null;
        }
    }
}

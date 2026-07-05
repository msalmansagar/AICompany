using System;
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
                default:
                    return e.GetRawText();
            }
        }

        public static bool IsNullOrEmpty(object? v)
            => v == null || (v is string s && s.Length == 0);

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

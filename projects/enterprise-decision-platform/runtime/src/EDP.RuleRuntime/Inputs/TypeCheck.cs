using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using EDP.RuleRuntime.Contract;

namespace EDP.RuleRuntime.Inputs
{
    /// <summary>
    /// The strict acceptance table of ADR-19 for one non-null value. Answers whether the value is
    /// valid for the declared type and, if so, the value converted to that type. Pure: no side effects.
    /// </summary>
    public sealed class TypeCheck
    {
        private static readonly Regex DatePattern = new Regex(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.CultureInvariant);
        private static readonly Regex DateTimePattern = new Regex(
            @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);

        private TypeCheck(bool isValid, object? normalised, string code, string reason)
        {
            IsValid = isValid;
            Normalised = normalised;
            Code = code;
            Reason = reason;
        }

        public bool IsValid { get; }
        public object? Normalised { get; }
        public string Code { get; }
        public string Reason { get; }

        private static TypeCheck Valid(object? value) => new TypeCheck(true, value, "", "");
        private static TypeCheck Mismatch(string reason) => new TypeCheck(false, null, "EDP062", reason);
        private static TypeCheck Fractional() => new TypeCheck(false, null, "EDP063", "a whole number or code has a fractional part.");

        /// <summary>Check a non-null value against a declared input type.</summary>
        public static TypeCheck Of(string declaredType, object value)
        {
            var kind = EngineContract.Current.StrictKindOf(declaredType);
            if (kind != StrictTypeKind.Collection && IsStructured(value))
                return Mismatch($"a {DescribeStructure(value)} cannot satisfy a single {declaredType} value.");
            switch (kind)
            {
                case StrictTypeKind.String: return value is string ? Valid(value) : Mismatch("expected a JSON string.");
                case StrictTypeKind.Decimal: return AsDecimal(value);
                case StrictTypeKind.Integer:
                case StrictTypeKind.Code: return AsWholeNumber(value);
                case StrictTypeKind.Boolean: return value is bool ? Valid(value) : Mismatch("expected JSON true or false.");
                case StrictTypeKind.Date: return AsDate(value);
                case StrictTypeKind.DateTime: return AsDateTime(value);
                case StrictTypeKind.Collection: return IsList(value) ? Valid(value) : Mismatch("expected a JSON array.");
                // Only a record-bound reference reaches here in a strict rule (a declared one is EDP066 at
                // validation). A caller supplying it sends the reference id as a JSON string, unconverted.
                default: return value is string ? Valid(value) : Mismatch($"expected a JSON string (a {declaredType} reference id).");
            }
        }

        private static TypeCheck AsDecimal(object value)
        {
            switch (value)
            {
                case decimal d: return Valid(d);
                case int i: return Valid((decimal)i);
                case long l: return Valid((decimal)l);
                case UnrepresentableNumber u: return Mismatch($"the number {u.RawText} is outside the decimal range.");
                case string _: return Mismatch("a quoted number is not accepted; send a JSON number.");
                default: return Mismatch("expected a JSON number.");
            }
        }

        private static TypeCheck AsWholeNumber(object value)
        {
            switch (value)
            {
                case int i: return Valid((long)i);
                case long l: return Valid(l);
                case decimal d when d != decimal.Truncate(d): return Fractional();
                case decimal d when d < long.MinValue || d > long.MaxValue: return Mismatch("the number is outside the whole-number range.");
                case decimal d: return Valid((long)d);
                case UnrepresentableNumber u: return Mismatch($"the number {u.RawText} is outside the whole-number range.");
                case string _: return Mismatch("a quoted number or label is not accepted; send a JSON number.");
                default: return Mismatch("expected a JSON number.");
            }
        }

        private static TypeCheck AsDate(object value)
        {
            if (value is DateTime already) return Valid(already);
            if (value is string text && DatePattern.IsMatch(text)
                && DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date))
                return Valid(DateTime.SpecifyKind(date, DateTimeKind.Utc));
            return Mismatch("expected an ISO-8601 date string (YYYY-MM-DD).");
        }

        private static TypeCheck AsDateTime(object value)
        {
            if (value is DateTime already) return Valid(already);
            if (value is string text && DateTimePattern.IsMatch(text)
                && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant))
                return Valid(instant.UtcDateTime);
            return Mismatch("expected an ISO-8601 date-time string with Z or an offset.");
        }

        private static bool IsStructured(object value) => IsList(value) || value is IReadOnlyDictionary<string, object?>;

        private static bool IsList(object value) => value is IEnumerable && !(value is string) && !(value is IReadOnlyDictionary<string, object?>);

        private static string DescribeStructure(object value) => IsList(value) ? "JSON array" : "JSON object";
    }
}

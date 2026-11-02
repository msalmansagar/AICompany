using System;
using System.Text;

namespace EDP.RuleRuntime.Hashing
{
    /// <summary>
    /// Rewrites a JSON number literal as its exact decimal value, by string manipulation alone
    /// (ADR-20 step 7). No binary floating point is ever involved, so 0.1, 1e3 and a 30-digit
    /// literal are all represented exactly. The TypeScript SDK implements the same algorithm.
    /// </summary>
    public static class CanonicalNumber
    {
        /// <summary>
        /// Canonicalise a raw JSON number token. Examples: "1.50" → "1.5", "2.0" → "2",
        /// "1e3" → "1000", "-0.0" → "0", "0.000120" → "0.00012".
        /// </summary>
        public static string Canonicalize(string raw, int maxExponentMagnitude)
        {
            var (negative, digits, pointPosition) = Decompose(raw, maxExponentMagnitude);
            var trimmed = digits.TrimStart('0');
            pointPosition -= digits.Length - trimmed.Length;
            if (trimmed.Length == 0) return "0";
            var text = Place(trimmed, pointPosition);
            return negative ? "-" + text : text;
        }

        /// <summary>Split "-12.30e2" into (negative, "1230", pointPosition = 2 + 2).</summary>
        private static (bool negative, string digits, int pointPosition) Decompose(string raw, int maxExponentMagnitude)
        {
            if (string.IsNullOrEmpty(raw)) throw new FormatException("Empty number literal.");
            var negative = raw[0] == '-';
            var body = negative ? raw.Substring(1) : raw;
            var exponentAt = body.IndexOfAny(new[] { 'e', 'E' });
            var exponent = exponentAt < 0 ? 0 : ParseExponent(body.Substring(exponentAt + 1), maxExponentMagnitude);
            var mantissa = exponentAt < 0 ? body : body.Substring(0, exponentAt);
            var pointAt = mantissa.IndexOf('.');
            var integerPart = pointAt < 0 ? mantissa : mantissa.Substring(0, pointAt);
            var fractionPart = pointAt < 0 ? "" : mantissa.Substring(pointAt + 1);
            if (integerPart.Length == 0 || !IsDigits(integerPart) || !IsDigits(fractionPart) || (pointAt >= 0 && fractionPart.Length == 0))
                throw new FormatException($"'{raw}' is not a JSON number.");
            return (negative, integerPart + fractionPart, integerPart.Length + exponent);
        }

        private static int ParseExponent(string text, int maxExponentMagnitude)
        {
            var sign = 1;
            if (text.StartsWith("+", StringComparison.Ordinal) || text.StartsWith("-", StringComparison.Ordinal))
            {
                sign = text[0] == '-' ? -1 : 1;
                text = text.Substring(1);
            }
            if (text.Length == 0 || !IsDigits(text) || text.TrimStart('0').Length > 6)
                throw new FormatException("Invalid or out-of-range exponent.");
            var value = int.Parse(text, System.Globalization.CultureInfo.InvariantCulture);
            if (value > maxExponentMagnitude) throw new FormatException("Exponent outside the allowed range.");
            return sign * value;
        }

        /// <summary>Put the decimal point into a digit string with no leading zeros, then trim the fraction.</summary>
        private static string Place(string digits, int pointPosition)
        {
            var builder = new StringBuilder();
            if (pointPosition <= 0)
                builder.Append("0.").Append('0', -pointPosition).Append(digits);
            else if (pointPosition >= digits.Length)
                builder.Append(digits).Append('0', pointPosition - digits.Length);
            else
                builder.Append(digits, 0, pointPosition).Append('.').Append(digits, pointPosition, digits.Length - pointPosition);
            var text = builder.ToString();
            if (text.IndexOf('.') < 0) return text;
            text = text.TrimEnd('0');
            return text.EndsWith(".", StringComparison.Ordinal) ? text.Substring(0, text.Length - 1) : text;
        }

        private static bool IsDigits(string text)
        {
            foreach (var character in text)
                if (character < '0' || character > '9') return false;
            return true;
        }
    }
}

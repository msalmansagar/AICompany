using System;
using System.Collections.Generic;
using System.Linq;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>One phone number read from the customer, with the column it came from.</summary>
    public sealed class CustomerPhone
    {
        public CustomerPhone(string field, string number)
        {
            Field = field;
            Number = number;
        }

        /// <summary>The customer column the number was read from.</summary>
        public string Field { get; }

        /// <summary>The number as stored, trimmed.</summary>
        public string Number { get; }
    }

    /// <summary>
    /// The multi-number SMS rules (FR-CSE-092, 093): the SMS configuration names an ordered list of
    /// customer phone columns, and each distinct number gets one SMS. Numbers are compared on their
    /// digits only, so "+974 5555 1234" and "97455551234" are one number (OQ-D1); the first column wins.
    /// </summary>
    public static class PhoneNumbers
    {
        private static readonly char[] FieldSeparators = { ',', ';' };

        /// <summary>The configured phone columns in order, without blanks or repeats. Empty when nothing is configured.</summary>
        public static IReadOnlyList<string> ParseFieldList(string configured)
        {
            if (string.IsNullOrWhiteSpace(configured)) return new string[0];
            return configured.Split(FieldSeparators, StringSplitOptions.RemoveEmptyEntries)
                .Select(field => field.Trim())
                .Where(field => field.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        /// <summary>The numbers to message: blanks dropped, one per distinct digit sequence, in column order.</summary>
        public static IReadOnlyList<CustomerPhone> Distinct(IEnumerable<CustomerPhone> phones)
        {
            var seenDigits = new HashSet<string>(StringComparer.Ordinal);
            var distinct = new List<CustomerPhone>();
            foreach (var phone in phones ?? Enumerable.Empty<CustomerPhone>())
            {
                var digits = DigitsOf(phone?.Number);
                if (digits.Length == 0 || !seenDigits.Add(digits)) continue;
                distinct.Add(new CustomerPhone(phone.Field, phone.Number.Trim()));
            }
            return distinct;
        }

        /// <summary>The digits of a number, in order; empty for null or a number without digits.</summary>
        public static string DigitsOf(string number) =>
            number == null ? string.Empty : new string(number.Where(char.IsDigit).ToArray());
    }
}

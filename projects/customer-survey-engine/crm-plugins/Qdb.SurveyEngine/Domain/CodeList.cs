using System;
using System.Collections.Generic;
using System.Linq;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>
    /// A set of configured codes such as status or type values, stored by admins as a
    /// comma-separated memo ("100000003, 100000004"). Comparison is on the trimmed text, so the
    /// same list works for option-set values, Yes/No fields ("true") and text codes.
    /// </summary>
    public sealed class CodeList
    {
        private readonly HashSet<string> _codes;

        private CodeList(IEnumerable<string> codes)
        {
            _codes = new HashSet<string>(codes, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>An empty list: a filter that is not configured.</summary>
        public static CodeList Empty { get; } = new CodeList(Enumerable.Empty<string>());

        /// <summary>True when no codes are configured.</summary>
        public bool IsEmpty => _codes.Count == 0;

        /// <summary>Parses an admin-entered list; blank entries are ignored.</summary>
        /// <param name="rawList">Comma- or semicolon-separated codes, or null.</param>
        public static CodeList Parse(string rawList)
        {
            if (string.IsNullOrWhiteSpace(rawList)) return Empty;
            var codes = rawList.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(code => code.Trim())
                .Where(code => code.Length > 0);
            return new CodeList(codes);
        }

        /// <summary>True when the code is in the list. A null code is never in it.</summary>
        public bool Contains(string code) => code != null && _codes.Contains(code.Trim());
    }
}

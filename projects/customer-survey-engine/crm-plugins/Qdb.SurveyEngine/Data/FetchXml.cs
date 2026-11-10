using System.Linq;
using System.Security;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Escaped FetchXML fragments for queries built from per-org field names.</summary>
    internal static class FetchXml
    {
        public static string Condition(string attribute, string op, string value) =>
            $"<condition attribute='{Escape(attribute)}' operator='{op}' value='{Escape(value)}' />";

        public static string NotNull(string attribute) => $"<condition attribute='{Escape(attribute)}' operator='not-null' />";

        public static string In(string attribute, string[] values) =>
            $"<condition attribute='{Escape(attribute)}' operator='in'>{string.Concat(values.Select(v => $"<value>{Escape(v)}</value>"))}</condition>";

        public static string Escape(string text) => SecurityElement.Escape(text);
    }
}

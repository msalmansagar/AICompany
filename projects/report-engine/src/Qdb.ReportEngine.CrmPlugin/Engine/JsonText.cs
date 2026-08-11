using System.Globalization;
using System.Text;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Writes a JSON string literal. Shared by the report and dashboard writers so the escaping rules
    /// — which are a security property here, not formatting — exist in exactly one place.
    /// </summary>
    internal static class JsonText
    {
        /// <summary>
        /// Escapes per RFC 8259. Control characters and the HTML-significant &lt; &gt; &amp; are emitted
        /// as \u escapes so a value carrying markup cannot break out of a script context in the page
        /// that consumes it.
        /// </summary>
        public static void Append(StringBuilder json, string value)
        {
            if (value == null)
            {
                json.Append("null");
                return;
            }

            json.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '"': json.Append("\\\""); break;
                    case '\\': json.Append("\\\\"); break;
                    case '\b': json.Append("\\b"); break;
                    case '\f': json.Append("\\f"); break;
                    case '\n': json.Append("\\n"); break;
                    case '\r': json.Append("\\r"); break;
                    case '\t': json.Append("\\t"); break;
                    default:
                        if (character < ' ' || character == '<' || character == '>' || character == '&')
                        {
                            json.Append("\\u").Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            json.Append(character);
                        }

                        break;
                }
            }

            json.Append('"');
        }
    }
}

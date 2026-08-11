using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Renders a set of Dataverse attribute values as a flat JSON object, for the before/after
    /// columns of the configuration audit trail.
    ///
    /// SDK values are unwrapped to what a reader would recognise: a choice becomes its numeric code,
    /// money becomes its amount, a lookup becomes its name where the platform supplied one and its id
    /// otherwise. An auditor reading the trail should not have to know the SDK's type system to see
    /// what changed.
    /// </summary>
    internal static class AuditJson
    {
        public static string Write(IEnumerable<KeyValuePair<string, object>> attributes)
        {
            var json = new StringBuilder("{");
            var first = true;
            foreach (var attribute in attributes)
            {
                if (!first) json.Append(',');
                first = false;
                JsonText.Append(json, attribute.Key);
                json.Append(':');
                AppendValue(json, attribute.Value);
            }

            return json.Append('}').ToString();
        }

        private static void AppendValue(StringBuilder json, object value)
        {
            switch (value)
            {
                case null:
                    json.Append("null");
                    break;
                case bool flag:
                    json.Append(flag ? "true" : "false");
                    break;
                case int number:
                    json.Append(number.ToString(CultureInfo.InvariantCulture));
                    break;
                case long number:
                    json.Append(number.ToString(CultureInfo.InvariantCulture));
                    break;
                case decimal number:
                    json.Append(number.ToString(CultureInfo.InvariantCulture));
                    break;
                case double number:
                    json.Append(number.ToString(CultureInfo.InvariantCulture));
                    break;
                case Money money:
                    json.Append(money.Value.ToString(CultureInfo.InvariantCulture));
                    break;
                case OptionSetValue option:
                    json.Append(option.Value.ToString(CultureInfo.InvariantCulture));
                    break;
                case DateTime moment:
                    JsonText.Append(json, moment.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture));
                    break;
                case EntityReference reference:
                    JsonText.Append(json, reference.Name ?? reference.Id.ToString());
                    break;
                case Guid id:
                    JsonText.Append(json, id.ToString());
                    break;
                default:
                    JsonText.Append(json, value.ToString());
                    break;
            }
        }
    }
}

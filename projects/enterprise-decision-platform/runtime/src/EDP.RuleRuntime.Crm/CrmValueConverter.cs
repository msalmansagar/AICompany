using System;
using Microsoft.Xrm.Sdk;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Converts CRM attribute values into the runtime's normalised value space
    /// (decimal / DateTime-UTC / bool / string / int). Keeps CRM types out of the
    /// portable runtime core.
    /// </summary>
    public static class CrmValueConverter
    {
        public static object? ToRuntime(object? crmValue)
        {
            switch (crmValue)
            {
                case null: return null;
                case AliasedValue av: return ToRuntime(av.Value);
                case Money m: return m.Value;
                case OptionSetValue os: return os.Value;                 // OptionSet/State/Status -> int
                case EntityReference er: return er.Id;                   // Lookup/Owner/Customer -> Guid
                case DateTime dt: return dt.ToUniversalTime();
                case double d: return (decimal)d;
                case int i: return i;
                case long l: return l;
                case decimal dec: return dec;
                case bool b: return b;
                case Guid g: return g;
                case string s: return s;
                default: return crmValue.ToString();
            }
        }
    }
}

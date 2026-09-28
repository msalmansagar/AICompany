using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EDP.RuleRuntime.Contract;

namespace EDP.RuleRuntime.Hashing
{
    /// <summary>
    /// The ContentHash of executable rule content (ADR-20): SHA-256 over a canonical, exact,
    /// serializer-independent byte form of the PCRM. Two rules with the same logic hash the same;
    /// metadata (name, ids, schema version, designer annotations) never affects the hash.
    /// </summary>
    public static class ContentHash
    {
        private static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);

        /// <summary>Compute the lower-case hex SHA-256 of the canonical form of <paramref name="pcrmJson"/>.</summary>
        public static string Compute(string pcrmJson) => Hash(Canonicalize(pcrmJson));

        /// <summary>The canonical text that <see cref="Compute"/> hashes (exposed for the shared test vectors).</summary>
        public static string Canonicalize(string pcrmJson)
        {
            var contract = EngineContract.Current;
            using var document = JsonDocument.Parse(pcrmJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                throw new FormatException("PCRM must be a JSON object.");
            var builder = new StringBuilder();
            WriteMembers(document.RootElement.EnumerateObject().Where(p => !IsExcludedMetadata(p.Name, contract)), builder, contract);
            return builder.ToString();
        }

        private static string Hash(string canonical)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Utf8NoBom.GetBytes(canonical));
            return string.Concat(bytes.Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
        }

        private static void WriteValue(JsonElement value, StringBuilder builder, EngineContract contract)
        {
            switch (value.ValueKind)
            {
                case JsonValueKind.Object: WriteMembers(value.EnumerateObject(), builder, contract); break;
                case JsonValueKind.Array: WriteArray(value, builder, contract); break;
                case JsonValueKind.String: WriteString(value.GetString()!, builder); break;
                case JsonValueKind.Number: builder.Append(CanonicalNumber.Canonicalize(value.GetRawText(), contract.MaxExponentMagnitude)); break;
                case JsonValueKind.True: builder.Append("true"); break;
                case JsonValueKind.False: builder.Append("false"); break;
                default: builder.Append("null"); break;
            }
        }

        /// <summary>Write an object from its members: nulls dropped, keys NFC and sorted by UTF-16 code unit.</summary>
        private static void WriteMembers(IEnumerable<JsonProperty> properties, StringBuilder builder, EngineContract contract)
        {
            var members = new SortedDictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in properties)
            {
                if (property.Value.ValueKind == JsonValueKind.Null) continue;
                var key = property.Name.Normalize(NormalizationForm.FormC);
                if (members.ContainsKey(key)) throw new FormatException($"Duplicate key '{key}' in PCRM.");
                members.Add(key, property.Value);
            }
            builder.Append('{');
            var first = true;
            foreach (var member in members)
            {
                if (!first) builder.Append(',');
                first = false;
                WriteString(member.Key, builder);
                builder.Append(':');
                WriteValue(member.Value, builder, contract);
            }
            builder.Append('}');
        }

        private static void WriteArray(JsonElement element, StringBuilder builder, EngineContract contract)
        {
            builder.Append('[');
            var first = true;
            foreach (var item in element.EnumerateArray())
            {
                if (!first) builder.Append(',');
                first = false;
                WriteValue(item, builder, contract);
            }
            builder.Append(']');
        }

        /// <summary>NFC, then escape only '"', '\' and U+0000–U+001F (as \u00xx, lower-case hex).</summary>
        private static void WriteString(string value, StringBuilder builder)
        {
            builder.Append('"');
            foreach (var character in value.Normalize(NormalizationForm.FormC))
            {
                if (character == '"') builder.Append("\\\"");
                else if (character == '\\') builder.Append("\\\\");
                else if (character < 0x20) builder.Append("\\u00").Append(((int)character).ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
                else builder.Append(character);
            }
            builder.Append('"');
        }

        private static bool IsExcludedMetadata(string name, EngineContract contract)
            => contract.ExcludedTopLevelProperties.Contains(name, StringComparer.Ordinal)
               || name.StartsWith(contract.ExcludedTopLevelPropertyPrefix, StringComparison.Ordinal);
    }
}

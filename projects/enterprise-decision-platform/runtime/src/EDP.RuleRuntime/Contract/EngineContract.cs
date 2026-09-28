using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace EDP.RuleRuntime.Contract
{
    /// <summary>How a strict rule accepts a value of a declared input type (ADR-19).</summary>
    public enum StrictTypeKind { String, Decimal, Integer, Boolean, Date, DateTime, Code, Collection, Unsupported }

    /// <summary>
    /// The shared Rule Engine contract (contract/rule-engine-contract.json, embedded in this
    /// assembly). One definition of the input-type vocabulary, the RuleKey format and the
    /// ContentHash exclusions, read by the runtime and checked against the designer and SDKs
    /// in CI (IC-3). Immutable once loaded.
    /// </summary>
    public sealed class EngineContract
    {
        private const string ResourceName = "EDP.RuleRuntime.Contract.rule-engine-contract.json";
        private static readonly Lazy<EngineContract> Loaded = new Lazy<EngineContract>(LoadEmbedded);

        private readonly IReadOnlyDictionary<string, StrictTypeKind> _strictKinds;

        private EngineContract(JsonElement root)
        {
            var strict = root.GetProperty("strictContract");
            StrictSchemaVersion = strict.GetProperty("schemaVersion").GetString()!;
            StrictInputContract = strict.GetProperty("inputContract").GetString()!;
            _strictKinds = root.GetProperty("inputTypes").EnumerateArray().ToDictionary(
                t => t.GetProperty("name").GetString()!, t => ParseKind(t.GetProperty("strict")), StringComparer.OrdinalIgnoreCase);
            var ruleKey = root.GetProperty("ruleKey");
            RuleKeyPattern = new Regex(ruleKey.GetProperty("pattern").GetString()!, RegexOptions.CultureInvariant);
            RuleKeyMinLength = ruleKey.GetProperty("minLength").GetInt32();
            RuleKeyMaxLength = ruleKey.GetProperty("maxLength").GetInt32();
            var correlation = root.GetProperty("correlationId");
            CorrelationIdMaxLength = correlation.GetProperty("maxLength").GetInt32();
            var hash = root.GetProperty("contentHash");
            ExcludedTopLevelProperties = hash.GetProperty("excludedTopLevelProperties").EnumerateArray().Select(p => p.GetString()!).ToArray();
            ExcludedTopLevelPropertyPrefix = hash.GetProperty("excludedTopLevelPropertyPrefix").GetString()!;
            MaxExponentMagnitude = hash.GetProperty("maxExponentMagnitude").GetInt32();
        }

        /// <summary>The contract embedded in this assembly.</summary>
        public static EngineContract Current => Loaded.Value;

        public string StrictSchemaVersion { get; }
        public string StrictInputContract { get; }
        public Regex RuleKeyPattern { get; }
        public int RuleKeyMinLength { get; }
        public int RuleKeyMaxLength { get; }
        public int CorrelationIdMaxLength { get; }
        public IReadOnlyList<string> ExcludedTopLevelProperties { get; }
        public string ExcludedTopLevelPropertyPrefix { get; }
        public int MaxExponentMagnitude { get; }

        /// <summary>How a strict rule accepts values of this declared type; unknown types are Unsupported.</summary>
        public StrictTypeKind StrictKindOf(string? declaredType)
            => declaredType != null && _strictKinds.TryGetValue(declaredType, out var kind) ? kind : StrictTypeKind.Unsupported;

        /// <summary>A RuleKey is valid when it matches the pattern and the length bounds exactly (never normalised).</summary>
        public bool IsValidRuleKey(string? key)
            => key != null && key.Length >= RuleKeyMinLength && key.Length <= RuleKeyMaxLength && RuleKeyPattern.IsMatch(key);

        private static StrictTypeKind ParseKind(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Null) return StrictTypeKind.Unsupported;
            switch (value.GetString())
            {
                case "string": return StrictTypeKind.String;
                case "decimal": return StrictTypeKind.Decimal;
                case "integer": return StrictTypeKind.Integer;
                case "boolean": return StrictTypeKind.Boolean;
                case "date": return StrictTypeKind.Date;
                case "datetime": return StrictTypeKind.DateTime;
                case "code": return StrictTypeKind.Code;
                case "collection": return StrictTypeKind.Collection;
                default: return StrictTypeKind.Unsupported;
            }
        }

        private static EngineContract LoadEmbedded()
        {
            using var stream = typeof(EngineContract).Assembly.GetManifestResourceStream(ResourceName)
                               ?? throw new InvalidOperationException($"Embedded contract '{ResourceName}' is missing from the assembly.");
            using var reader = new StreamReader(stream);
            using var document = JsonDocument.Parse(reader.ReadToEnd());
            return new EngineContract(document.RootElement.Clone());
        }
    }
}

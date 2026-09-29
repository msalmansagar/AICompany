using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Edp.DecisionClient
{
    /// <summary>Address a rule by published version, rule id, rule key, or rule name (one required).</summary>
    public sealed record RuleRef
    {
        public string? VersionId { get; init; }
        public string? Id { get; init; }
        /// <summary>
        /// Lower-case alphanumeric human-readable key (pattern: ^[a-z0-9]+([._-][a-z0-9]+)*$, length 3–100).
        /// The SDK validates the pattern client-side and never normalises the value (IC-3).
        /// </summary>
        public string? Key { get; init; }
        public string? Name { get; init; }

        public static RuleRef ByVersion(string versionId) => new() { VersionId = versionId };
        public static RuleRef ById(string id) => new() { Id = id };
        /// <summary>
        /// Address by human-readable key. The key must already be lower-case and valid (3–100 chars,
        /// pattern ^[a-z0-9]+([._-][a-z0-9]+)*$); the SDK validates but never normalises it.
        /// </summary>
        public static RuleRef ByKey(string key) => new() { Key = key };
        public static RuleRef ByName(string name) => new() { Name = name };
    }

    /// <summary>
    /// Decision outcome literals (FR-B2-06). IC-3: the string values MUST equal the contract literals.
    /// </summary>
    /// <summary>
    /// The RuleKey and CorrelationId limits of the shared Rule Engine contract (IC-3).
    /// ContractParityTests holds them equal to contract/rule-engine-contract.json.
    /// </summary>
    public static class DecisionContract
    {
        public const string RuleKeyPattern = @"^[a-z0-9]+([._-][a-z0-9]+)*$";
        public const int RuleKeyMinLength = 3;
        public const int RuleKeyMaxLength = 100;
        public const int CorrelationIdMinLength = 1;
        public const int CorrelationIdMaxLength = 100;
    }

    public static class DecisionOutcome
    {
        public const string Matched = "MATCHED";
        public const string NoMatch = "NO_MATCH";
        public const string InputRejected = "INPUT_REJECTED";
        public const string EngineError = "ENGINE_ERROR";
    }

    /// <summary>
    /// Provenance record parsed from the EvaluateDecision ProvenanceJson field (FR-B4-02, ADR-20).
    /// </summary>
    public sealed record DecisionProvenance
    {
        public string? ExecutionId { get; init; }
        public string? RuleId { get; init; }
        public string? RuleKey { get; init; }
        public string? RuleVersionId { get; init; }
        public int? VersionNumber { get; init; }
        public string? ContentHash { get; init; }
        public string? EvaluatedOnUtc { get; init; }
        public string? CorrelationId { get; init; }
    }

    public sealed record ResponseMeta
    {
        public string? CorrelationId { get; init; }
        public string? RequestId { get; init; }
        public string? ExecutionId { get; init; }
        public long? ElapsedMs { get; init; }
    }

    public sealed record DecisionResult
    {
        public ResponseMeta Meta { get; init; } = new();
        public bool Matched { get; init; }
        public Dictionary<string, JsonElement> Outputs { get; init; } = new();
        public JsonElement? Trace { get; init; }
        public JsonElement? Diagnostics { get; init; }
        /// <summary>
        /// Decision outcome literal (FR-B2-06). One of DecisionOutcome constants.
        /// Present on EvaluateDecision and TestDecision responses.
        /// </summary>
        public string? Outcome { get; init; }
        /// <summary>
        /// Parsed provenance (FR-B4-02). Present on EvaluateDecision and TestDecision responses.
        /// </summary>
        public DecisionProvenance? Provenance { get; init; }
    }

    public sealed record ValidateResult
    {
        public ResponseMeta Meta { get; init; } = new();
        public bool Valid { get; init; }
        public JsonElement? Diagnostics { get; init; }
    }

    public sealed record RuleSetResult
    {
        public ResponseMeta Meta { get; init; } = new();
        /// <summary>The rule set's native aggregate payload (policy, matched count, per-member results).</summary>
        public JsonElement? Result { get; init; }
    }

    public sealed record SchemaResult
    {
        public ResponseMeta Meta { get; init; } = new();
        public JsonElement? Inputs { get; init; }
        public JsonElement? Outputs { get; init; }
    }

    public sealed record ReadResult
    {
        public ResponseMeta Meta { get; init; } = new();
        public JsonElement? Result { get; init; }
    }
}

using System.Collections.Generic;
using System.Text.Json;

namespace Edp.DecisionClient
{
    /// <summary>Address a rule by published version, rule id, or rule name (one required).</summary>
    public sealed record RuleRef
    {
        public string? VersionId { get; init; }
        public string? Id { get; init; }
        public string? Name { get; init; }

        public static RuleRef ByVersion(string versionId) => new() { VersionId = versionId };
        public static RuleRef ById(string id) => new() { Id = id };
        public static RuleRef ByName(string name) => new() { Name = name };
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

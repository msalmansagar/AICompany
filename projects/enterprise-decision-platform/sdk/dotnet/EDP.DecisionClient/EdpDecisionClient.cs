using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Edp.DecisionClient
{
    /// <summary>
    /// Typed .NET client for the EDP Decision Gateway. Per ADR-EDS-09 it is an envelope builder
    /// only — it assembles the canonical request, calls the gateway, and returns the typed result.
    /// No decision logic, no Dataverse knowledge.
    /// </summary>
    public sealed class EdpDecisionClient
    {
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        private static readonly IReadOnlyDictionary<string, object?> Empty = new Dictionary<string, object?>();

        private readonly HttpClient _http;
        private readonly string _baseUrl;
        private readonly string? _apiKey;

        public EdpDecisionClient(string baseUrl, string? apiKey = null, HttpClient? httpClient = null)
        {
            if (string.IsNullOrWhiteSpace(baseUrl)) throw new ArgumentException("baseUrl is required", nameof(baseUrl));
            _baseUrl = baseUrl.TrimEnd('/');
            _apiKey = apiKey;
            _http = httpClient ?? new HttpClient();
        }

        /// <summary>Evaluate a decision (durable — writes an execution log).</summary>
        public Task<DecisionResult> EvaluateAsync(RuleRef rule, IReadOnlyDictionary<string, object?>? input = null, bool includeTrace = false, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<DecisionResult>("/v1/decisions/evaluate", DecisionEnvelope(rule, input, includeTrace, correlationId), cancellationToken);

        /// <summary>Test a decision (no durable write).</summary>
        public Task<DecisionResult> TestAsync(RuleRef rule, IReadOnlyDictionary<string, object?>? input = null, bool includeTrace = false, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<DecisionResult>("/v1/decisions/test", DecisionEnvelope(rule, input, includeTrace, correlationId), cancellationToken);

        /// <summary>Validate a rule's structure.</summary>
        public Task<ValidateResult> ValidateAsync(RuleRef rule, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<ValidateResult>("/v1/rules/validate", new { meta = Meta(correlationId), rule }, cancellationToken);

        /// <summary>Evaluate a governed rule set by id.</summary>
        public Task<RuleSetResult> EvaluateRuleSetAsync(Guid ruleSetId, IReadOnlyDictionary<string, object?>? input = null, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<RuleSetResult>("/v1/rule-sets/evaluate", new { meta = Meta(correlationId), ruleSetId, input = input ?? Empty }, cancellationToken);

        /// <summary>Get a rule's input/output schema.</summary>
        public Task<SchemaResult> GetSchemaAsync(RuleRef rule, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<SchemaResult>("/v1/rules/schema", new { meta = Meta(correlationId), rule }, cancellationToken);

        /// <summary>Get a rule's version history (rule addressed by id or name).</summary>
        public Task<ReadResult> GetHistoryAsync(RuleRef rule, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<ReadResult>("/v1/rules/history", new { meta = Meta(correlationId), rule }, cancellationToken);

        /// <summary>Explain a past decision by its execution-log id.</summary>
        public Task<ReadResult> ExplainAsync(Guid executionLogId, string? correlationId = null, CancellationToken cancellationToken = default)
            => PostAsync<ReadResult>("/v1/decisions/explain", new { meta = Meta(correlationId), executionLogId }, cancellationToken);

        private static object? Meta(string? correlationId) => correlationId is null ? null : new { correlationId };

        private static object DecisionEnvelope(RuleRef rule, IReadOnlyDictionary<string, object?>? input, bool includeTrace, string? correlationId)
            => new { meta = Meta(correlationId), rule, input = input ?? Empty, options = new { includeTrace } };

        private async Task<T> PostAsync<T>(string path, object envelope, CancellationToken cancellationToken)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, _baseUrl + path)
            {
                Content = new StringContent(JsonSerializer.Serialize(envelope, Json), Encoding.UTF8, "application/json"),
            };
            if (_apiKey is not null) request.Headers.Add("x-api-key", _apiKey);

            using var response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var (code, message) = ParseError(body, (int)response.StatusCode);
                throw new EdpDecisionException(code, message, (int)response.StatusCode);
            }
            return JsonSerializer.Deserialize<T>(body, Json)
                ?? throw new EdpDecisionException("empty_response", "Gateway returned an empty body.", (int)response.StatusCode);
        }

        private static (string code, string message) ParseError(string body, int status)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var err))
                {
                    var code = err.TryGetProperty("code", out var c) ? c.GetString() ?? "gateway_error" : "gateway_error";
                    var message = err.TryGetProperty("message", out var m) ? m.GetString() ?? "Gateway error." : "Gateway error.";
                    return (code, message);
                }
            }
            catch (JsonException) { /* not a JSON error envelope */ }
            return ("gateway_error", $"Gateway returned {status}.");
        }
    }
}

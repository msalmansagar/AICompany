using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Orchestrates one CRM-hosted decision: bind inputs from a target record, execute
    /// the single runtime, and emit the ADR-13 trace (best-effort) + audit (durable).
    /// This is the reusable core every entry-point adapter calls; it holds no CRM
    /// plumbing beyond IOrganizationService, so it is fully unit-testable with a fake.
    /// </summary>
    public sealed class RuleDecisionService
    {
        private static readonly JsonSerializerOptions JsonOptions =
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        private readonly IOrganizationService _service;
        private readonly RuleRuntimeService _runtime;
        private readonly ITraceSink _trace;

        public RuleDecisionService(IOrganizationService service, IMetadataResolver metadata, ITraceSink trace)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _runtime = new RuleRuntimeService(metadata ?? throw new ArgumentNullException(nameof(metadata)));
            _trace = trace ?? throw new ArgumentNullException(nameof(trace));
        }

        /// <summary>Retrieve the PCRM payload for a published rule version.</summary>
        public string ResolvePcrm(Guid ruleVersionId)
        {
            var record = _service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new Microsoft.Xrm.Sdk.Query.ColumnSet("qdb_edp_pcrmjson"));
            var pcrm = record.GetAttributeValue<string>("qdb_edp_pcrmjson");
            if (string.IsNullOrWhiteSpace(pcrm))
                throw new InvalidOperationException($"Rule version {ruleVersionId} has no PCRM payload.");
            return pcrm!;
        }

        /// <summary>
        /// Evaluate a rule against a target record. Inputs are bound from the target's
        /// attributes via each PCRM input's Binding. Trace is written best-effort after
        /// the decision is produced; it never affects the returned result.
        /// </summary>
        public RuleResult Evaluate(string pcrmJson, Entity target, Guid? ruleVersionId, Guid actorId, DateTime nowUtc)
            => EvaluateInputs(pcrmJson, BuildInputs(pcrmJson, target), ruleVersionId, actorId, nowUtc);

        /// <summary>
        /// Evaluate against a pre-built input dictionary (e.g. from a Custom API
        /// InputsJson parameter) — lets a decision be tested without a target record.
        /// </summary>
        public RuleResult EvaluateInputs(string pcrmJson, IDictionary<string, object?> inputs, Guid? ruleVersionId, Guid actorId, DateTime nowUtc)
        {
            var result = _runtime.Execute(pcrmJson, inputs, nowUtc);

            _trace.WriteTrace(new TraceRecord
            {
                RuleVersionId = ruleVersionId,
                ResolvedVersion = ruleVersionId?.ToString() ?? "adhoc",
                Outcome = result.Success ? (result.Matched ? "matched" : "no-match") : "error",
                DurationMs = result.ElapsedMilliseconds,
                Actor = actorId.ToString(),
                ExecutedOnUtc = nowUtc,
                TraceJson = result.Trace != null
                    ? JsonSerializer.Serialize(result.Trace.Steps.Select(s => new { kind = s.Kind, description = s.Description, result = s.Result }))
                    : null
            });

            return result;
        }

        /// <summary>Parse a Custom API InputsJson string into a runtime input dictionary.</summary>
        public static IDictionary<string, object?> ParseInputsJson(string? inputsJson)
        {
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(inputsJson)) return inputs;
            using var doc = JsonDocument.Parse(inputsJson);
            foreach (var prop in doc.RootElement.EnumerateObject())
                inputs[prop.Name] = FromJson(prop.Value);
            return inputs;
        }

        private static object? FromJson(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.String: return e.GetString();
                case JsonValueKind.Number: return e.GetDecimal();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                default: return null;
            }
        }

        private IDictionary<string, object?> BuildInputs(string pcrmJson, Entity target)
        {
            var doc = JsonSerializer.Deserialize<PcrmDocument>(pcrmJson, JsonOptions)
                      ?? throw new InvalidOperationException("PCRM payload could not be parsed.");

            var relatedByRelationship = LoadRelatedRecords(doc, target);

            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var input in doc.Inputs)
            {
                var binding = string.IsNullOrWhiteSpace(input.Binding) ? input.Name : input.Binding!;
                var source = IsNavigated(input) ? relatedByRelationship[input.Via!.Relationship] : target;
                var crmValue = source != null && source.Contains(binding) ? source[binding] : null;
                inputs[input.Name] = CrmValueConverter.ToRuntime(crmValue);
            }
            return inputs;
        }

        private static bool IsNavigated(PcrmInput input)
            => input.Via != null && !string.IsNullOrWhiteSpace(input.Via.Relationship);

        /// <summary>
        /// Follow each distinct N:1 lookup on the target once, retrieving only the fields the
        /// related inputs bind to. A missing/empty lookup yields a null related record, so the
        /// input resolves to null (deterministic — no exception).
        /// </summary>
        private IDictionary<string, Entity?> LoadRelatedRecords(PcrmDocument doc, Entity target)
        {
            var byRelationship = new Dictionary<string, Entity?>(StringComparer.OrdinalIgnoreCase);
            var columnsByRelationship = doc.Inputs
                .Where(IsNavigated)
                .GroupBy(i => i.Via!.Relationship, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(i => string.IsNullOrWhiteSpace(i.Binding) ? i.Name : i.Binding!).Distinct().ToArray(),
                    StringComparer.OrdinalIgnoreCase);

            foreach (var pair in columnsByRelationship)
            {
                var reference = target != null && target.Contains(pair.Key) ? target[pair.Key] as EntityReference : null;
                byRelationship[pair.Key] = reference == null
                    ? null
                    : _service.Retrieve(reference.LogicalName, reference.Id, new Microsoft.Xrm.Sdk.Query.ColumnSet(pair.Value));
            }
            return byRelationship;
        }
    }
}

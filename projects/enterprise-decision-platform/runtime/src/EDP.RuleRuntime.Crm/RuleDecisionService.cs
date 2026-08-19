using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;
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

        private const int LifecyclePublished = 100000003;

        /// <summary>
        /// Retrieve the PCRM payload for a rule version. Execution paths require the version to be
        /// Published (governance gate, F-01); only Validate/Test may resolve a Draft.
        /// </summary>
        public string ResolvePcrm(Guid ruleVersionId, bool requirePublished = true)
        {
            var record = _service.Retrieve("qdb_edp_ruleversion", ruleVersionId,
                new Microsoft.Xrm.Sdk.Query.ColumnSet("qdb_edp_pcrmjson", "qdb_edp_lifecyclestate"));

            if (requirePublished && record.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value != LifecyclePublished)
                throw new InvalidOperationException($"Rule version {ruleVersionId} is not Published and cannot be executed.");

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
        public DecisionOutcome Evaluate(string pcrmJson, Entity target, Guid? ruleVersionId, Guid actorId, DateTime nowUtc)
            => EvaluateInputs(pcrmJson, BuildInputs(pcrmJson, target), ruleVersionId, actorId, nowUtc);

        /// <summary>
        /// Evaluate against a pre-built input dictionary (e.g. from a Custom API
        /// InputsJson parameter) — lets a decision be tested without a target record.
        /// </summary>
        public DecisionOutcome EvaluateInputs(string pcrmJson, IDictionary<string, object?> inputs, Guid? ruleVersionId, Guid actorId, DateTime nowUtc)
        {
            var result = _runtime.Execute(pcrmJson, inputs, nowUtc);

            var executionLogId = _trace.WriteTrace(new TraceRecord
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

            return new DecisionOutcome(result, executionLogId);
        }

        /// <summary>Parse a Custom API InputsJson string into a runtime input dictionary.</summary>
        public static IDictionary<string, object?> ParseInputsJson(string? inputsJson)
        {
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(inputsJson)) return inputs;
            // inputsJson! — guarded above; net462 lacks [NotNullWhen] on IsNullOrWhiteSpace.
            using var doc = JsonDocument.Parse(inputsJson!);
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

                // Collections delegate to the core so that a caller's array reaches the engine as
                // a collection by this route too. Before F1 this returned null here while
                // RuntimeValue.FromJson returned the array's raw text — the same payload became
                // two different values depending on which door it came through.
                case JsonValueKind.Array: return RuntimeValue.ToCollection(e);
                case JsonValueKind.Object: return RuntimeValue.ToRecord(e);

                // Scalars stay on this path deliberately: RuntimeValue.FromJson also parses
                // date-like strings into DateTime, and changing that for every InputsJson caller
                // is a semantic change no requirement asked for.
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
                if (input.Aggregate != null) { inputs[input.Name] = ResolveAggregate(target, input); continue; }
                var binding = string.IsNullOrWhiteSpace(input.Binding) ? input.Name : input.Binding!;
                var source = IsNavigated(input) ? relatedByRelationship[input.Via!.Relationship] : target;
                var crmValue = source != null && source.Contains(binding) ? source[binding] : null;
                inputs[input.Name] = CrmValueConverter.ToRuntime(crmValue);
            }
            return inputs;
        }

        /// <summary>
        /// Fold an anchor's 1:N child collection into a scalar: query children by their lookup
        /// back to the anchor, apply the optional single-condition filter in memory, then apply
        /// the aggregate function. Empty collection is deterministic (Count/Sum 0, others null).
        /// </summary>
        private object? ResolveAggregate(Entity target, PcrmInput input)
        {
            var agg = input.Aggregate!;
            var columns = new List<string>();
            if (!string.IsNullOrWhiteSpace(input.Binding)) columns.Add(input.Binding!);
            if (agg.Filter != null && !string.IsNullOrWhiteSpace(agg.Filter.Field)) columns.Add(agg.Filter.Field);

            var query = new QueryExpression(agg.ChildEntity)
            {
                ColumnSet = columns.Count > 0 ? new ColumnSet(columns.Distinct().ToArray()) : new ColumnSet(false),
                TopCount = 5000,
                Criteria = { Conditions = { new ConditionExpression(agg.ChildLookup, ConditionOperator.Equal, target.Id) } },
            };

            IEnumerable<Entity> rows = _service.RetrieveMultiple(query).Entities;
            if (agg.Filter != null && !string.IsNullOrWhiteSpace(agg.Filter.Field))
                rows = rows.Where(r => MatchesFilter(r, agg.Filter));
            return Fold(agg.Function, input.Binding, rows);
        }

        private static object? Fold(string function, string? binding, IEnumerable<Entity> rows)
        {
            var list = rows.ToList();
            if (string.Equals(function, "Count", StringComparison.OrdinalIgnoreCase)) return list.Count;

            var values = list
                .Select(r => AsDecimal(binding != null && r.Contains(binding) ? r[binding] : null))
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();

            switch (function.ToLowerInvariant())
            {
                case "sum": return values.Sum();
                case "avg": return values.Count > 0 ? (object)(values.Sum() / values.Count) : null;
                case "min": return values.Count > 0 ? (object)values.Min() : null;
                case "max": return values.Count > 0 ? (object)values.Max() : null;
                default: return null;
            }
        }

        private static bool MatchesFilter(Entity row, PcrmAggregateFilter filter)
        {
            var raw = row.Contains(filter.Field) ? row[filter.Field] : null;
            switch (filter.Operator)
            {
                case "GreaterThan": case "GreaterThanOrEqual": case "LessThan": case "LessThanOrEqual":
                    var a = AsDecimal(raw); var b = FilterDecimal(filter.Value);
                    if (!a.HasValue || !b.HasValue) return false;
                    return filter.Operator == "GreaterThan" ? a > b
                        : filter.Operator == "GreaterThanOrEqual" ? a >= b
                        : filter.Operator == "LessThan" ? a < b : a <= b;
                default: // Equals / NotEquals — compare textual form, case-insensitive
                    var eq = string.Equals(CrmValueConverter.ToRuntime(raw)?.ToString() ?? "", FilterString(filter.Value), StringComparison.OrdinalIgnoreCase);
                    return filter.Operator == "NotEquals" ? !eq : eq;
            }
        }

        private static decimal? AsDecimal(object? raw)
        {
            var v = CrmValueConverter.ToRuntime(raw);
            if (v == null) return null;
            try { return Convert.ToDecimal(v); } catch { return null; }
        }

        private static string FilterString(JsonElement e)
            => e.ValueKind == JsonValueKind.String ? (e.GetString() ?? "") : e.ValueKind == JsonValueKind.Null ? "" : e.GetRawText();

        private static decimal? FilterDecimal(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Number && e.TryGetDecimal(out var d)) return d;
            if (e.ValueKind == JsonValueKind.String && decimal.TryParse(e.GetString(), out var s)) return s;
            return null;
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

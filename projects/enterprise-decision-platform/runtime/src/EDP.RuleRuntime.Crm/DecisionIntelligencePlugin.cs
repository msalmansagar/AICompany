using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Phase 6 Decision Intelligence — read-only advisory Functions (ADR-AI-02, ADR-AI-05,
    /// ADR-AI-07). A THIN adapter backing two Custom API Functions; it branches on the
    /// invoked message name. It NEVER executes a rule, NEVER calls an AI provider, and
    /// NEVER mutates data — it only reads recorded facts (execution log + step-trace) and
    /// projects an explanation or a historical aggregate. This is the deterministic first
    /// cut: explanation is built from the recorded trace (AI prose enrichment is a later,
    /// out-of-band enhancement via IAiProvider, never in this sandbox).
    ///
    /// Backed messages (unbound Functions, response property ResultJson):
    ///   qdb_edp_ExplainDecision — narrate one recorded decision's trace (business + technical)
    ///   qdb_edp_GetAnalytics    — historical count/avg/max duration by outcome over the log
    /// </summary>
    public sealed class DecisionIntelligencePlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            try
            {
                object result;
                switch (context.MessageName)
                {
                    case "qdb_edp_ExplainDecision": result = ExplainDecision(service, context); break;
                    case "qdb_edp_GetAnalytics": result = GetAnalytics(service, context); break;
                    default: throw new InvalidPluginExecutionException($"Unsupported intelligence message '{context.MessageName}'.");
                }
                context.OutputParameters["ResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP decision intelligence failed: {ex.Message}", ex);
            }
        }

        // ---- Explain Decision (grounded in the recorded trace) -------------------------

        private static object ExplainDecision(IOrganizationService service, IPluginExecutionContext context)
        {
            var logId = ParamGuid(context, "ExecutionLogId")
                        ?? throw new InvalidPluginExecutionException("Provide ExecutionLogId.");

            var log = service.Retrieve("qdb_edp_ruleexecutionlog", logId, new ColumnSet(
                "qdb_edp_ruleexecutionlogname", "qdb_edp_outcome", "qdb_edp_durationms",
                "qdb_edp_resolvedversion", "qdb_edp_wouldresolveversion", "qdb_edp_actor",
                "qdb_edp_executedon", "qdb_edp_tracejson"));

            var outcome = log.GetAttributeValue<string>("qdb_edp_outcome") ?? "unknown";
            var name = log.GetAttributeValue<string>("qdb_edp_ruleexecutionlogname") ?? "decision";
            var durationMs = log.GetAttributeValue<int>("qdb_edp_durationms");
            var resolvedVersion = log.GetAttributeValue<string>("qdb_edp_resolvedversion") ?? "";
            var steps = ParseTrace(log.GetAttributeValue<string>("qdb_edp_tracejson"));

            return new
            {
                executionLogId = logId,
                outcome,
                business = BusinessNarrative(name, outcome, durationMs, steps),
                technical = new
                {
                    resolvedVersion,
                    wouldResolveVersion = log.GetAttributeValue<string>("qdb_edp_wouldresolveversion") ?? "",
                    actor = log.GetAttributeValue<string>("qdb_edp_actor") ?? "",
                    executedOn = log.GetAttributeValue<DateTime?>("qdb_edp_executedon"),
                    durationMs,
                    stepCount = steps.Count
                },
                steps
            };
        }

        /// <summary>Deterministic business narration built only from recorded trace facts.</summary>
        private static string BusinessNarrative(string name, string outcome, int durationMs, IReadOnlyList<TraceStep> steps)
        {
            var sb = new StringBuilder();
            sb.Append($"The decision '{name}' evaluated to ");
            sb.Append(outcome == "matched" ? "MATCHED" : outcome == "no-match" ? "NO MATCH" : outcome.ToUpperInvariant());
            sb.Append($" in {durationMs} ms.");

            var decisive = steps.Where(s => s.Kind == "condition" && s.Result == true)
                                .Select(s => s.Description).ToList();
            if (outcome == "matched" && decisive.Count > 0)
                sb.Append(" It matched because: " + string.Join("; ", decisive) + ".");
            else if (outcome == "no-match")
                sb.Append(" No rule branch was satisfied by the supplied inputs.");
            else if (outcome == "error")
                sb.Append(" The evaluation ended in an error before producing an outcome.");

            return sb.ToString();
        }

        // ---- Get Analytics (historical aggregate over the execution log) ---------------

        private static object GetAnalytics(IOrganizationService service, IPluginExecutionContext context)
        {
            var versionFilter = ParamString(context, "RuleVersionId");
            var filterXml = string.IsNullOrWhiteSpace(versionFilter)
                ? ""
                : $"<filter><condition attribute='qdb_edp_resolvedversion' operator='eq' value='{System.Security.SecurityElement.Escape(versionFilter)}' /></filter>";

            var fetch =
                "<fetch aggregate='true'>" +
                "  <entity name='qdb_edp_ruleexecutionlog'>" +
                "    <attribute name='qdb_edp_ruleexecutionlogid' alias='cnt' aggregate='count' />" +
                "    <attribute name='qdb_edp_durationms' alias='avgdur' aggregate='avg' />" +
                "    <attribute name='qdb_edp_durationms' alias='maxdur' aggregate='max' />" +
                "    <attribute name='qdb_edp_outcome' alias='outcome' groupby='true' />" +
                filterXml +
                "  </entity>" +
                "</fetch>";

            var rows = service.RetrieveMultiple(new FetchExpression(fetch)).Entities;

            var byOutcome = new List<object>();
            long total = 0;
            double weightedDurationSum = 0;
            foreach (var r in rows)
            {
                var count = AliasInt(r, "cnt");
                var avg = AliasDouble(r, "avgdur");
                var max = AliasDouble(r, "maxdur");
                var outcome = (r.GetAttributeValue<AliasedValue>("outcome")?.Value as string) ?? "unknown";
                total += count;
                weightedDurationSum += avg * count;
                byOutcome.Add(new { outcome, count, avgDurationMs = Math.Round(avg, 2), maxDurationMs = Math.Round(max, 2) });
            }

            return new
            {
                ruleVersionFilter = versionFilter ?? "",
                totalExecutions = total,
                overallAvgDurationMs = total > 0 ? Math.Round(weightedDurationSum / total, 2) : 0,
                byOutcome,
                note = "Historical aggregate over qdb_edp_ruleexecutionlog (ADR-AI-02). Dataverse caps aggregate rollup at 50k rows; portfolio-scale metrics use the snapshot tier (ADR-AI-09). P95 requires the snapshot pipeline."
            };
        }

        // ---- helpers -------------------------------------------------------------------

        private static IReadOnlyList<TraceStep> ParseTrace(string? traceJson)
        {
            if (string.IsNullOrWhiteSpace(traceJson)) return Array.Empty<TraceStep>();
            try
            {
                return JsonSerializer.Deserialize<List<TraceStep>>(traceJson,
                           new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? new List<TraceStep>();
            }
            catch
            {
                return Array.Empty<TraceStep>();
            }
        }

        private static long AliasInt(Entity e, string alias)
        {
            var v = e.GetAttributeValue<AliasedValue>(alias)?.Value;
            return v == null ? 0 : Convert.ToInt64(v, CultureInfo.InvariantCulture);
        }

        private static double AliasDouble(Entity e, string alias)
        {
            var v = e.GetAttributeValue<AliasedValue>(alias)?.Value;
            return v == null ? 0d : Convert.ToDouble(v, CultureInfo.InvariantCulture);
        }

        private static string? ParamString(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;

        private static Guid? ParamGuid(IPluginExecutionContext context, string name)
        {
            var raw = ParamString(context, name);
            return string.IsNullOrWhiteSpace(raw) ? (Guid?)null : Guid.Parse(raw);
        }

        /// <summary>Recorded trace step (mirrors the shape persisted in qdb_edp_tracejson).</summary>
        private sealed class TraceStep
        {
            public string Kind { get; set; } = "";
            public string Description { get; set; } = "";
            public bool? Result { get; set; }
        }
    }
}

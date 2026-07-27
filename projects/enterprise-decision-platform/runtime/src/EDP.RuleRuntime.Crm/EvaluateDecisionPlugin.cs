using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Sinks;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Custom API / Custom Action entry point. A THIN adapter (ADR-06/ADR-R05): it only
    /// marshals inputs, resolves the published PCRM + target record, calls the single
    /// runtime via RuleDecisionService, and marshals the result back into output
    /// parameters. No decision logic lives here.
    ///
    /// Input parameters (all optional except one PCRM source):
    ///   PcrmJson      (string) — an ad-hoc PCRM to evaluate directly (used by the designer Test button).
    ///   RuleVersionId (string, GUID) — a saved rule version to resolve the PCRM from.
    ///   InputsJson    (string) — input values as JSON (test without a record).
    ///   TargetRef     (EntityReference) — a record supplying input field values.
    /// Output parameters:
    ///   Success (bool), Matched (bool), OutputsJson (string), ReasonCodesJson (string),
    ///   TraceJson (string), DiagnosticsJson (string), ElapsedMs (int),
    ///   ExecutionId (string) — the execution-log id this decision was traced to.
    /// </summary>
    public sealed class EvaluateDecisionPlugin : IPlugin
    {
        private const int MaxPcrmJsonLength = 512_000; // guard against pathologically large payloads (F-08)

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            try
            {
                var pcrmJson = Param(context, "PcrmJson");
                var ruleVersionIdStr = Param(context, "RuleVersionId");
                var inputsJson = Param(context, "InputsJson");
                var targetRef = context.InputParameters.Contains("TargetRef") ? context.InputParameters["TargetRef"] as EntityReference : null;

                Guid? ruleVersionId = string.IsNullOrWhiteSpace(ruleVersionIdStr) ? (Guid?)null : Guid.Parse(ruleVersionIdStr);

                if (!string.IsNullOrEmpty(pcrmJson) && pcrmJson.Length > MaxPcrmJsonLength)     // F-08
                    throw new InvalidPluginExecutionException($"PcrmJson exceeds the {MaxPcrmJsonLength} character limit.");
                if (string.IsNullOrWhiteSpace(inputsJson) && targetRef == null)                 // QA-B1: avoid a null-ref crash
                    throw new InvalidPluginExecutionException("Provide InputsJson (ad-hoc inputs) or TargetRef (a record to evaluate).");

                var metadata = new OrgServiceMetadataResolver(service);
                var decisionService = new RuleDecisionService(service, metadata, new DataverseTraceSink(service));

                // PCRM source: explicit PcrmJson (live canvas) wins; else resolve the saved version (Published-gated).
                var pcrm = !string.IsNullOrWhiteSpace(pcrmJson)
                    ? pcrmJson!
                    : decisionService.ResolvePcrm(ruleVersionId ?? throw new InvalidPluginExecutionException("Provide PcrmJson or RuleVersionId."));

                var outcome = !string.IsNullOrWhiteSpace(inputsJson)
                    ? decisionService.EvaluateInputs(pcrm, RuleDecisionService.ParseInputsJson(inputsJson), ruleVersionId, context.InitiatingUserId, DateTime.UtcNow)
                    : decisionService.Evaluate(pcrm, service.Retrieve(targetRef!.LogicalName, targetRef.Id, new ColumnSet(true)), ruleVersionId, context.InitiatingUserId, DateTime.UtcNow);
                var result = outcome.Result;

                // Addresses this decision for a later ExplainDecision call. Empty when the
                // best-effort trace was dropped — the decision itself is unaffected (ADR-13).
                context.OutputParameters["ExecutionId"] = outcome.ExecutionLogId?.ToString() ?? string.Empty;
                context.OutputParameters["Success"] = result.Success;
                context.OutputParameters["Matched"] = result.Matched;
                context.OutputParameters["OutputsJson"] = JsonSerializer.Serialize(result.Outputs);
                context.OutputParameters["ReasonCodesJson"] = JsonSerializer.Serialize(result.ReasonCodes);
                context.OutputParameters["ElapsedMs"] = (int)result.ElapsedMilliseconds;
                context.OutputParameters["TraceJson"] = JsonSerializer.Serialize(
                    result.Trace.Steps.Select(s => new { kind = s.Kind, description = s.Description, result = s.Result }));
                context.OutputParameters["DiagnosticsJson"] = JsonSerializer.Serialize(
                    result.Diagnostics.Select(d => new { code = d.Code, message = d.Message, severity = d.Severity.ToString() }));
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP decision evaluation failed: {ex.Message}", ex);
            }
        }

        private static string? Param(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;
    }
}

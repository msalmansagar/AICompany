using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Contract;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Hashing;

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
    ///   CorrelationId (string, 1–100 chars) — caller-owned, echoed verbatim, never interpreted (FR-B4-01).
    /// Output parameters:
    ///   Outcome (string) — MATCHED | NO_MATCH | INPUT_REJECTED | ENGINE_ERROR, the value callers
    ///     branch on (FR-B2-06). Success = MATCHED or NO_MATCH; Matched = MATCHED; both are kept.
    ///   Success (bool), Matched (bool), OutputsJson (string), ReasonCodesJson (string),
    ///   TraceJson (string), DiagnosticsJson (string), ElapsedMs (int),
    ///   ExecutionId (string) — the execution-log id this decision was traced to; empty when the
    ///     best-effort trace was dropped, so it is not a correlation key (CorrelationId is).
    ///   ProvenanceJson (string) — what ran: executionId, ruleId, ruleKey, ruleVersionId,
    ///     versionNumber, contentHash, evaluatedOnUtc, correlationId (FR-B4-02, ADR-20). One JSON
    ///     envelope because an on-prem Process Action cannot reuse a request argument name
    ///     (RuleVersionId, CorrelationId) as a response argument.
    /// A malformed request (bad JSON, missing or conflicting parameters) fails as HTTP 400;
    /// a rejected input is a result (HTTP 200, Outcome INPUT_REJECTED).
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
                var correlationId = ReadCorrelationId(context);
                var nowUtc = DateTime.UtcNow;

                Guid? ruleVersionId = string.IsNullOrWhiteSpace(ruleVersionIdStr) ? (Guid?)null : Guid.Parse(ruleVersionIdStr);

                // pcrmJson! — the && short-circuit guarantees non-null; net462 lacks [NotNullWhen] on IsNullOrEmpty.
                if (!string.IsNullOrEmpty(pcrmJson) && pcrmJson!.Length > MaxPcrmJsonLength)    // F-08
                    throw new InvalidPluginExecutionException($"PcrmJson exceeds the {MaxPcrmJsonLength} character limit.");
                if (string.IsNullOrWhiteSpace(inputsJson) && targetRef == null)                 // QA-B1: avoid a null-ref crash
                    throw new InvalidPluginExecutionException("Provide InputsJson (ad-hoc inputs) or TargetRef (a record to evaluate).");

                var metadata = new OrgServiceMetadataResolver(service);
                var decisionService = new RuleDecisionService(service, metadata, new DataverseTraceSink(service));

                // PCRM source: explicit PcrmJson (live canvas) wins; else resolve the saved version (Published-gated).
                var executable = !string.IsNullOrWhiteSpace(pcrmJson)
                    ? ExecutableRuleVersion.AdHoc(pcrmJson!)
                    : decisionService.ResolveExecutable(ruleVersionId ?? throw new InvalidPluginExecutionException("Provide PcrmJson or RuleVersionId."));
                var pcrm = executable.Pcrm;
                var contentHash = ContentHash.Compute(pcrm);

                var outcome = !string.IsNullOrWhiteSpace(inputsJson)
                    ? decisionService.EvaluateInputs(pcrm, RuleDecisionService.ParseInputsJson(inputsJson), ruleVersionId, context.InitiatingUserId, nowUtc)
                    : decisionService.Evaluate(pcrm, service.Retrieve(targetRef!.LogicalName, targetRef.Id, new ColumnSet(true)), ruleVersionId, context.InitiatingUserId, nowUtc);
                var result = outcome.Result;

                // Addresses this decision for a later ExplainDecision call. Empty when the
                // best-effort trace was dropped — the decision itself is unaffected (ADR-13).
                var executionId = outcome.ExecutionLogId?.ToString() ?? string.Empty;
                context.OutputParameters["ExecutionId"] = executionId;
                context.OutputParameters["Outcome"] = result.OutcomeCode;
                context.OutputParameters["ProvenanceJson"] = JsonSerializer.Serialize(new
                {
                    executionId,
                    ruleId = executable.RuleId,
                    ruleKey = executable.RuleKey,
                    ruleVersionId = executable.RuleVersionId,
                    versionNumber = executable.VersionNumber,
                    contentHash,
                    evaluatedOnUtc = nowUtc.ToString("o", CultureInfo.InvariantCulture),
                    correlationId
                });
                context.OutputParameters["Success"] = result.Success;
                context.OutputParameters["Matched"] = result.Matched;
                context.OutputParameters["OutputsJson"] = JsonSerializer.Serialize(result.Outputs);
                context.OutputParameters["ReasonCodesJson"] = JsonSerializer.Serialize(result.ReasonCodes);
                context.OutputParameters["ElapsedMs"] = (int)result.ElapsedMilliseconds;
                context.OutputParameters["TraceJson"] = JsonSerializer.Serialize(
                    result.Trace.Steps.Select(s => new { kind = s.Kind, description = s.Description, result = s.Result }));
                context.OutputParameters["DiagnosticsJson"] = JsonSerializer.Serialize(
                    result.Diagnostics.Select(d => new { code = d.Code, message = d.Message, severity = d.Severity.ToString(), location = d.Location }));

                // Per-child detail is ADDITIVE (ADR-17): the anchor outputs above are the mandatory
                // half and render on a stock form; this is the optional half a capable surface may
                // use. Fan-out is InputsJson-only in F1 — the collection is assembled by the caller,
                // which is where a fact-assembly layer already builds it.
                var childCollectionName = Param(context, "ChildCollectionName");
                if (!string.IsNullOrWhiteSpace(childCollectionName) && !string.IsNullOrWhiteSpace(inputsJson))
                {
                    var fanOut = decisionService.EvaluateForEachChild(pcrm, new FanOutRequest(
                        RuleDecisionService.ParseInputsJson(inputsJson),
                        childCollectionName!,
                        nowUtc)
                    {
                        RuleVersionId = ruleVersionId,
                        ActorId = context.InitiatingUserId
                    });

                    context.OutputParameters["ChildResultsJson"] = JsonSerializer.Serialize(new
                    {
                        total = fanOut.Total,
                        matched = fanOut.MatchedCount,
                        unmatched = fanOut.UnmatchedCount,
                        children = fanOut.Children.Select(c => new
                        {
                            index = c.Index,
                            id = c.Id,
                            outcome = c.Result.OutcomeCode,
                            success = c.Result.Success,
                            matched = c.Result.Matched,
                            outputs = c.Result.Outputs,
                            reasonCodes = c.Result.ReasonCodes
                        })
                    });
                }
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

        /// <summary>The caller's CorrelationId, or null when absent; out of bounds is a malformed request.</summary>
        private static string? ReadCorrelationId(IPluginExecutionContext context)
        {
            var correlationId = Param(context, "CorrelationId");
            if (string.IsNullOrEmpty(correlationId)) return null;
            var maxLength = EngineContract.Current.CorrelationIdMaxLength;
            if (correlationId!.Length > maxLength)
                throw new InvalidPluginExecutionException($"CorrelationId must be 1 to {maxLength} characters.");
            return correlationId;
        }

        private static string? Param(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;
    }
}

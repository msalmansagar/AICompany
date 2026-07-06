using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Enterprise Decision Service — the remaining operation surface (Phase 5). A THIN
    /// adapter (ADR-06/ADR-EDS-01/03) backing seven Custom API messages; it branches on
    /// the invoked message name and funnels every execution to the single runtime.
    ///
    /// Actions (may write execution trace): qdb_edp_ValidateRule, qdb_edp_TestRule,
    ///   qdb_edp_ExecuteDecisionTable, qdb_edp_ExecuteRuleSet.
    /// Functions (read-only): qdb_edp_GetRuleHistory, qdb_edp_GetRuleTemplates,
    ///   qdb_edp_GetRuleDocumentation.
    /// All return a single ResultJson string (envelope-style, ADR-EDS-04).
    /// </summary>
    public sealed class RuleServicePlugin : IPlugin
    {
        private const int LifecyclePublished = 100000003;
        private static readonly JsonSerializerOptions PcrmOptions =
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

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
                    case "qdb_edp_ValidateRule": result = ValidateRule(service, context); break;
                    case "qdb_edp_TestRule": result = TestRule(service, context); break;
                    case "qdb_edp_ExecuteDecisionTable": result = ExecuteDecisionTable(service, context); break;
                    case "qdb_edp_ExecuteRuleSet": result = ExecuteRuleSet(service, context); break;
                    case "qdb_edp_GetRuleHistory": result = GetRuleHistory(service, context); break;
                    case "qdb_edp_GetRuleTemplates": result = GetRuleTemplates(service, context); break;
                    case "qdb_edp_GetRuleDocumentation": result = GetRuleDocumentation(service, context); break;
                    default: throw new InvalidPluginExecutionException($"Unsupported service message '{context.MessageName}'.");
                }
                context.OutputParameters["ResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP service operation failed: {ex.Message}", ex);
            }
        }

        // ---- Actions -------------------------------------------------------------------

        /// <summary>Compile-and-validate a PCRM payload or stored version — no execution.</summary>
        private object ValidateRule(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ResolvePcrm(service, context);
            var doc = ParsePcrm(pcrmJson);
            var diagnostics = new RuleValidator(new OrgServiceMetadataResolver(service)).Validate(doc);
            var errors = diagnostics.Count(d => d.Severity == RuleErrorSeverity.Error);
            return new
            {
                isValid = errors == 0,
                errorCount = errors,
                warningCount = diagnostics.Count(d => d.Severity == RuleErrorSeverity.Warning),
                diagnostics = diagnostics.Select(SerializeDiagnostic).ToList()
            };
        }

        /// <summary>Execute against supplied inputs WITHOUT writing durable audit (test tier).</summary>
        private object TestRule(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ResolvePcrm(service, context);
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var runtime = new RuleRuntimeService(new OrgServiceMetadataResolver(service));
            var result = runtime.TestRule(pcrmJson, inputs, DateTime.UtcNow);
            return SerializeResult(result, executionSource: "test");
        }

        /// <summary>Dedicated decision-table entry — same runtime; asserts table logic.</summary>
        private object ExecuteDecisionTable(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ResolvePcrm(service, context);
            var doc = ParsePcrm(pcrmJson);
            if (!string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException("ExecuteDecisionTable requires a rule whose logic is a decision table.");

            var ruleVersionId = ParamGuid(context, "RuleVersionId");
            var decision = new RuleDecisionService(service, new OrgServiceMetadataResolver(service), new DataverseTraceSink(service));
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var result = decision.EvaluateInputs(pcrmJson, inputs, ruleVersionId, context.InitiatingUserId, DateTime.UtcNow);
            return SerializeResult(result, executionSource: "decision-table");
        }

        /// <summary>Evaluate an ordered set of rule versions in one call (caller-provided set).</summary>
        private object ExecuteRuleSet(IOrganizationService service, IPluginExecutionContext context)
        {
            var idsJson = ParamString(context, "RuleVersionIdsJson")
                          ?? throw new InvalidPluginExecutionException("Provide RuleVersionIdsJson (array of rule version ids).");
            var ids = JsonSerializer.Deserialize<List<string>>(idsJson) ?? new List<string>();
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var metadata = new OrgServiceMetadataResolver(service);
            var decision = new RuleDecisionService(service, metadata, new DataverseTraceSink(service));

            var results = new List<object>();
            var matched = 0;
            foreach (var idText in ids)
            {
                var id = Guid.Parse(idText);
                var pcrm = decision.ResolvePcrm(id);
                var r = decision.EvaluateInputs(pcrm, inputs, id, context.InitiatingUserId, DateTime.UtcNow);
                if (r.Matched) matched++;
                results.Add(new { ruleVersionId = id, success = r.Success, matched = r.Matched, outputs = r.Outputs });
            }
            return new { count = ids.Count, matchedCount = matched, results };
        }

        // ---- Functions (read-only) -----------------------------------------------------

        private object GetRuleHistory(IOrganizationService service, IPluginExecutionContext context)
        {
            var ruleId = ResolveRuleId(service, context)
                         ?? throw new InvalidPluginExecutionException("Provide RuleId, RuleName, or RuleVersionId.");
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid", "qdb_edp_versionnumber", "qdb_edp_lifecyclestate", "qdb_edp_ispinned", "createdon"),
                Orders = { new OrderExpression("qdb_edp_versionnumber", OrderType.Descending) },
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId) } }
            };
            var versions = service.RetrieveMultiple(query).Entities.Select(v => new
            {
                ruleVersionId = v.Id,
                versionNumber = v.GetAttributeValue<int>("qdb_edp_versionnumber"),
                lifecycleState = v.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value ?? -1,
                lifecycleLabel = LifecycleLabel(v.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value ?? -1),
                isPinned = v.GetAttributeValue<bool>("qdb_edp_ispinned"),
                createdOn = v.GetAttributeValue<DateTime?>("createdon")
            }).ToList();
            return new { ruleId, versionCount = versions.Count, versions };
        }

        private object GetRuleTemplates(IOrganizationService service, IPluginExecutionContext context)
        {
            var query = new QueryExpression("qdb_edp_ruletemplate")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruletemplateid", "qdb_edp_ruletemplatename", "qdb_edp_industry", "qdb_edp_parametersjson")
            };
            var industry = ParamString(context, "Industry");
            if (!string.IsNullOrWhiteSpace(industry))
                query.Criteria.AddCondition("qdb_edp_industry", ConditionOperator.Equal, industry);

            var templates = service.RetrieveMultiple(query).Entities.Select(x => new
            {
                templateId = x.Id,
                name = x.GetAttributeValue<string>("qdb_edp_ruletemplatename") ?? "",
                industry = x.GetAttributeValue<string>("qdb_edp_industry") ?? "",
                hasParameters = !string.IsNullOrWhiteSpace(x.GetAttributeValue<string>("qdb_edp_parametersjson"))
            }).ToList();
            return new { templateCount = templates.Count, templates };
        }

        private object GetRuleDocumentation(IOrganizationService service, IPluginExecutionContext context)
        {
            var ruleId = ResolveRuleId(service, context)
                         ?? throw new InvalidPluginExecutionException("Provide RuleId, RuleName, or RuleVersionId.");
            var query = new QueryExpression("qdb_edp_ruledocumentation")
            {
                ColumnSet = new ColumnSet("qdb_edp_content"),
                TopCount = 1,
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId) } }
            };
            var stored = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            var content = stored?.GetAttributeValue<string>("qdb_edp_content");
            if (!string.IsNullOrWhiteSpace(content))
                return new { ruleId, source = "stored", content };

            // No stored documentation — generate a deterministic structural doc from PCRM.
            var version = ResolveLatestVersion(service, ruleId);
            var generated = version == null ? "(no rule version found to document)" : GenerateDoc(ParsePcrm(version.GetAttributeValue<string>("qdb_edp_pcrmjson")));
            return new { ruleId, source = "generated", content = generated };
        }

        // ---- shared helpers ------------------------------------------------------------

        /// <summary>PCRM source: explicit PcrmJson wins; else resolve from a saved version.</summary>
        private string ResolvePcrm(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ParamString(context, "PcrmJson");
            if (!string.IsNullOrWhiteSpace(pcrmJson)) return pcrmJson!;
            var ruleVersionId = ParamGuid(context, "RuleVersionId")
                                ?? throw new InvalidPluginExecutionException("Provide PcrmJson or RuleVersionId.");
            var record = service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new ColumnSet("qdb_edp_pcrmjson"));
            var pcrm = record.GetAttributeValue<string>("qdb_edp_pcrmjson");
            if (string.IsNullOrWhiteSpace(pcrm))
                throw new InvalidPluginExecutionException($"Rule version {ruleVersionId} has no PCRM payload.");
            return pcrm!;
        }

        private Guid? ResolveRuleId(IOrganizationService service, IPluginExecutionContext context)
        {
            var direct = ParamGuid(context, "RuleId");
            if (direct.HasValue) return direct;

            var versionId = ParamGuid(context, "RuleVersionId");
            if (versionId.HasValue)
            {
                var v = service.Retrieve("qdb_edp_ruleversion", versionId.Value, new ColumnSet("qdb_edp_ruleid"));
                return v.GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Id;
            }

            var name = ParamString(context, "RuleName");
            if (string.IsNullOrWhiteSpace(name)) return null;
            var query = new QueryExpression("qdb_edp_rule")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleid"),
                TopCount = 1,
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_rulename", ConditionOperator.Equal, name) } }
            };
            return service.RetrieveMultiple(query).Entities.FirstOrDefault()?.Id;
        }

        private static Entity? ResolveLatestVersion(IOrganizationService service, Guid ruleId)
        {
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_pcrmjson"),
                TopCount = 1,
                Orders = { new OrderExpression("qdb_edp_versionnumber", OrderType.Descending) },
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId) } }
            };
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        private static string GenerateDoc(PcrmDocument doc)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# {doc.Name}");
            sb.AppendLine($"Target entity: {doc.TargetEntity}");
            sb.AppendLine($"Logic type: {doc.Logic.Type}");
            sb.AppendLine();
            sb.AppendLine("## Inputs");
            foreach (var i in doc.Inputs) sb.AppendLine($"- {i.Name} ({i.Type})");
            sb.AppendLine();
            sb.AppendLine("## Outputs");
            foreach (var o in doc.Outputs) sb.AppendLine($"- {o.Name} ({o.Type})");
            if (doc.Logic.OutputColumns.Count > 0)
                foreach (var c in doc.Logic.OutputColumns) sb.AppendLine($"- {c} (table output)");
            return sb.ToString();
        }

        private static PcrmDocument ParsePcrm(string? pcrmJson)
        {
            if (string.IsNullOrWhiteSpace(pcrmJson))
                throw new InvalidPluginExecutionException("PCRM payload is empty.");
            return JsonSerializer.Deserialize<PcrmDocument>(pcrmJson, PcrmOptions)
                   ?? throw new InvalidPluginExecutionException("PCRM payload could not be parsed.");
        }

        private static object SerializeResult(RuleResult result, string executionSource) => new
        {
            executionSource,
            success = result.Success,
            matched = result.Matched,
            outputs = result.Outputs,
            elapsedMs = result.ElapsedMilliseconds,
            diagnostics = result.Diagnostics.Select(SerializeDiagnostic).ToList(),
            steps = result.Trace.Steps.Select(s => new { kind = s.Kind, description = s.Description, result = s.Result }).ToList()
        };

        private static object SerializeDiagnostic(RuleDiagnostic d)
            => new { code = d.Code, message = d.Message, severity = d.Severity.ToString(), location = d.Location };

        private static string LifecycleLabel(int value)
        {
            switch (value)
            {
                case 100000000: return "Draft";
                case 100000001: return "In Review";
                case 100000002: return "Approved";
                case LifecyclePublished: return "Published";
                case 100000004: return "Retired";
                default: return "Unknown";
            }
        }

        private static string? ParamString(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;

        private static Guid? ParamGuid(IPluginExecutionContext context, string name)
        {
            var raw = ParamString(context, name);
            return string.IsNullOrWhiteSpace(raw) ? (Guid?)null : Guid.Parse(raw);
        }
    }
}

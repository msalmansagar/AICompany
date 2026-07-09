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

        /// <summary>
        /// Evaluate a set of rules in one call. Preferred: a governed qdb_edp_ruleset
        /// (RuleSetId) that owns the membership + policy — the caller cannot redefine it.
        /// Back-compat: a caller-provided RuleVersionIdsJson list (policy = Collect).
        /// Policies: Collect (run all), FirstMatch (stop at first match), Priority (run all,
        /// later members override on merge).
        /// </summary>
        private object ExecuteRuleSet(IOrganizationService service, IPluginExecutionContext context)
        {
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var decision = new RuleDecisionService(service, new OrgServiceMetadataResolver(service), new DataverseTraceSink(service));

            Guid? ruleSetId = ParamGuid(context, "RuleSetId");
            List<SetMember> members;
            string policy;

            if (ruleSetId.HasValue)
            {
                var set = service.Retrieve("qdb_edp_ruleset", ruleSetId.Value, new ColumnSet("qdb_edp_membersjson", "qdb_edp_setpolicy"));
                members = ParseMembers(set.GetAttributeValue<string>("qdb_edp_membersjson") ?? "[]", service);
                policy = set.GetAttributeValue<string>("qdb_edp_setpolicy");
                if (string.IsNullOrWhiteSpace(policy)) policy = "Collect";
            }
            else
            {
                var idsJson = ParamString(context, "RuleVersionIdsJson")
                              ?? throw new InvalidPluginExecutionException("Provide RuleSetId (governed set) or RuleVersionIdsJson.");
                var ids = JsonSerializer.Deserialize<List<string>>(idsJson) ?? new List<string>();
                members = ids.Select((s, i) => new SetMember { VersionId = Guid.Parse(s), Key = "rule" + (i + 1), Order = i }).ToList();
                policy = "Collect";
            }

            var firstMatch = string.Equals(policy, "FirstMatch", StringComparison.OrdinalIgnoreCase);
            var ordered = members.OrderBy(m => m.Order).ToList();
            var results = new List<object>();
            var mergedOutputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            var byRule = new Dictionary<string, object?>();
            var matchedCount = 0;

            foreach (var m in ordered)
            {
                if (!m.VersionId.HasValue)
                {
                    results.Add(new { key = m.Key, ruleId = m.RuleId, success = false, matched = false, message = "No published version for this rule." });
                    continue;
                }
                var pcrm = decision.ResolvePcrm(m.VersionId.Value);
                var r = decision.EvaluateInputs(pcrm, inputs, m.VersionId, context.InitiatingUserId, DateTime.UtcNow);
                results.Add(new { key = m.Key, ruleVersionId = m.VersionId, success = r.Success, matched = r.Matched, outputs = r.Outputs });
                if (r.Matched)
                {
                    matchedCount++;
                    byRule[m.Key] = r.Outputs;
                    foreach (var kv in r.Outputs) mergedOutputs[kv.Key] = kv.Value; // later members win (Priority/Collect)
                    if (firstMatch) break;
                }
            }

            return new
            {
                ruleSetId,
                policy,
                count = ordered.Count,
                matchedCount,
                results,
                aggregate = new { outputs = mergedOutputs, byRule }
            };
        }

        private sealed class SetMember
        {
            public Guid? VersionId { get; set; }
            public Guid? RuleId { get; set; }
            public string Key { get; set; } = "rule";
            public int Order { get; set; }
        }

        /// <summary>Parse a ruleset's membersjson; resolve each member to a rule version id.</summary>
        private List<SetMember> ParseMembers(string membersJson, IOrganizationService service)
        {
            var list = new List<SetMember>();
            using var doc = JsonDocument.Parse(membersJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return list;
            var i = 0;
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                var m = new SetMember
                {
                    Order = el.TryGetProperty("order", out var o) && o.TryGetInt32(out var ov) ? ov : i,
                    Key = el.TryGetProperty("key", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString()! : "rule" + (i + 1),
                };
                if (el.TryGetProperty("ruleVersionId", out var rv) && Guid.TryParse(rv.GetString(), out var rvid))
                    m.VersionId = rvid;
                else if (el.TryGetProperty("ruleId", out var rid) && Guid.TryParse(rid.GetString(), out var ridGuid))
                {
                    m.RuleId = ridGuid;
                    m.VersionId = ResolvePublishedVersionId(service, ridGuid); // governed: run the published version
                }
                list.Add(m);
                i++;
            }
            return list;
        }

        private static Guid? ResolvePublishedVersionId(IOrganizationService service, Guid ruleId)
        {
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid"),
                TopCount = 1,
                Orders = { new OrderExpression("qdb_edp_versionnumber", OrderType.Descending) },
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId),
                        new ConditionExpression("qdb_edp_lifecyclestate", ConditionOperator.Equal, LifecyclePublished),
                    }
                }
            };
            return service.RetrieveMultiple(query).Entities.FirstOrDefault()?.Id;
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

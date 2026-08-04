using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Analytics;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Scenarios;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;
using EDP.RuleRuntime.Scenarios;
using EDP.RuleRuntime.Versioning;

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
        private const int MaxPcrmJsonLength = 512_000; // guard against pathologically large payloads (F-08)
        private const int AnalyticsPageSize = 5000;    // Dataverse page cap per RetrieveMultiple
        private const int MaxAnalyticsRows = 50_000;   // bound in-plugin aggregation to stay within the 2-min limit
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
                    case "qdb_edp_RunScenarios": result = RunScenarios(service, context); break;
                    case "qdb_edp_ExecuteDecisionTable": result = ExecuteDecisionTable(service, context); break;
                    case "qdb_edp_ExecuteRuleSet": result = ExecuteRuleSet(service, context); break;
                    case "qdb_edp_GetRuleHistory": result = GetRuleHistory(service, context); break;
                    case "qdb_edp_GetRuleTemplates": result = GetRuleTemplates(service, context); break;
                    case "qdb_edp_GetRuleDocumentation": result = GetRuleDocumentation(service, context); break;
                    case "qdb_edp_GetRuleAnalytics": result = GetRuleAnalytics(service, context); break;
                    case "qdb_edp_ResolveEffectiveVersion": result = ResolveEffectiveVersion(service, context); break;
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
            var pcrmJson = ResolvePcrm(service, context, requirePublished: false);
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
            var pcrmJson = ResolvePcrm(service, context, requirePublished: false);
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var runtime = new RuleRuntimeService(new OrgServiceMetadataResolver(service));
            var result = runtime.TestRule(pcrmJson, inputs, DateTime.UtcNow);
            return SerializeResult(result, executionSource: "test");
        }

        /// <summary>
        /// Run the rule's saved scenario suite against a PCRM payload (the live canvas via PcrmJson,
        /// or a stored version) and report per-scenario pass/fail. Read-only, no durable audit.
        /// </summary>
        private object RunScenarios(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ResolvePcrm(service, context, requirePublished: false);
            var ruleId = ResolveRuleId(service, context)
                         ?? throw new InvalidPluginExecutionException("Provide RuleId, RuleName, or RuleVersionId.");
            var scenariosJson = ScenarioStore.LoadScenariosJson(service, ruleId);
            var runtime = new RuleRuntimeService(new OrgServiceMetadataResolver(service));
            var summary = ScenarioRunner.Run(scenariosJson, pcrmJson, runtime, DateTime.UtcNow);

            return new
            {
                ruleId,
                total = summary.Total,
                passed = summary.Passed,
                failed = summary.Failed,
                allPassed = summary.AllPassed,
                results = summary.Results.Select(r => new
                {
                    name = r.Name,
                    passed = r.Passed,
                    mismatches = r.Mismatches,
                    error = r.Error,
                    actual = r.Actual
                }).ToList()
            };
        }

        /// <summary>Dedicated decision-table entry — same runtime; asserts table logic.</summary>
        private object ExecuteDecisionTable(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ResolvePcrm(service, context, requirePublished: true);
            var doc = ParsePcrm(pcrmJson);
            if (!string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException("ExecuteDecisionTable requires a rule whose logic is a decision table.");

            var ruleVersionId = ParamGuid(context, "RuleVersionId");
            var decision = new RuleDecisionService(service, new OrgServiceMetadataResolver(service), new DataverseTraceSink(service));
            var inputs = RuleDecisionService.ParseInputsJson(ParamString(context, "InputsJson"));
            var outcome = decision.EvaluateInputs(pcrmJson, inputs, ruleVersionId, context.InitiatingUserId, DateTime.UtcNow);
            return SerializeResult(outcome.Result, executionSource: "decision-table");
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
            // The pipeline context: seeded with the caller's inputs, then each matched member's
            // outputs are folded back in — so a downstream rule can read an upstream rule's output
            // as one of its inputs (ordered chaining). Independent sets are unaffected (a rule that
            // references no upstream output sees exactly the original inputs).
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
                var r = decision.EvaluateInputs(pcrm, inputs, m.VersionId, context.InitiatingUserId, DateTime.UtcNow).Result;
                results.Add(new { key = m.Key, ruleVersionId = m.VersionId, success = r.Success, matched = r.Matched, outputs = r.Outputs });
                if (r.Matched)
                {
                    matchedCount++;
                    byRule[m.Key] = r.Outputs;
                    foreach (var kv in r.Outputs)
                    {
                        mergedOutputs[kv.Key] = kv.Value; // aggregate result (later members win)
                        inputs[kv.Key] = kv.Value;        // pipeline: feed outputs forward to later members
                    }
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
                    m.VersionId = ResolveEffectiveVersionId(service, ridGuid, DateTime.UtcNow); // governed: run the version effective now
                }
                list.Add(m);
                i++;
            }
            return list;
        }

        private static Guid? ResolveEffectiveVersionId(IOrganizationService service, Guid ruleId, DateTime asOfUtc)
            => EffectiveVersionResolver.Resolve(PublishedCandidates(service, ruleId), asOfUtc)?.VersionId;

        /// <summary>All Published versions of a rule with their effective windows — the resolver's input.</summary>
        private static List<VersionCandidate> PublishedCandidates(IOrganizationService service, Guid ruleId)
        {
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid", "qdb_edp_versionnumber", "qdb_edp_effectivefrom", "qdb_edp_effectiveto"),
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId),
                        new ConditionExpression("qdb_edp_lifecyclestate", ConditionOperator.Equal, LifecyclePublished),
                    }
                }
            };
            return service.RetrieveMultiple(query).Entities.Select(v => new VersionCandidate
            {
                VersionId = v.Id,
                VersionNumber = v.GetAttributeValue<int>("qdb_edp_versionnumber"),
                EffectiveFrom = v.GetAttributeValue<DateTime?>("qdb_edp_effectivefrom"),
                EffectiveTo = v.GetAttributeValue<DateTime?>("qdb_edp_effectiveto"),
            }).ToList();
        }

        // ---- Functions (read-only) -----------------------------------------------------

        private object GetRuleHistory(IOrganizationService service, IPluginExecutionContext context)
        {
            var ruleId = ResolveRuleId(service, context)
                         ?? throw new InvalidPluginExecutionException("Provide RuleId, RuleName, or RuleVersionId.");
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid", "qdb_edp_versionnumber", "qdb_edp_lifecyclestate", "qdb_edp_ispinned", "qdb_edp_effectivefrom", "qdb_edp_effectiveto", "createdon"),
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
                effectiveFrom = v.GetAttributeValue<DateTime?>("qdb_edp_effectivefrom"),
                effectiveTo = v.GetAttributeValue<DateTime?>("qdb_edp_effectiveto"),
                createdOn = v.GetAttributeValue<DateTime?>("createdon")
            }).ToList();
            return new { ruleId, versionCount = versions.Count, versions };
        }

        /// <summary>
        /// Which Published version is effective at a given instant (default: now). The primitive
        /// behind effective dating — the designer uses it to show "effective now" and callers can
        /// preview a future cutover.
        /// </summary>
        private object ResolveEffectiveVersion(IOrganizationService service, IPluginExecutionContext context)
        {
            var ruleId = ResolveRuleId(service, context)
                         ?? throw new InvalidPluginExecutionException("Provide RuleId, RuleName, or RuleVersionId.");
            var asOf = ParamDate(context, "AsOf") ?? DateTime.UtcNow;
            var candidates = PublishedCandidates(service, ruleId);
            var winner = EffectiveVersionResolver.Resolve(candidates, asOf);
            return new
            {
                ruleId,
                asOf = asOf.ToString("o"),
                publishedCount = candidates.Count,
                resolved = winner == null ? null : new
                {
                    ruleVersionId = winner.VersionId,
                    versionNumber = winner.VersionNumber,
                    effectiveFrom = winner.EffectiveFrom,
                    effectiveTo = winner.EffectiveTo
                }
            };
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

        /// <summary>
        /// Aggregate execution-log telemetry into dashboard metrics over a rolling window: volume,
        /// outcome mix, latency percentiles, a per-day series, and the busiest rule-versions.
        /// Optional RuleId scopes to one rule; absent = organisation-wide. Aggregation runs in C#
        /// (Dataverse has no server-side percentile), capped at MaxAnalyticsRows to stay in-budget.
        /// </summary>
        private object GetRuleAnalytics(IOrganizationService service, IPluginExecutionContext context)
        {
            var periodDays = ParsePeriodDays(ParamString(context, "PeriodDays"));
            var toUtc = DateTime.UtcNow;
            var fromUtc = toUtc.AddDays(-periodDays);

            var ruleId = ParamGuid(context, "RuleId");
            var versionIds = ruleId.HasValue ? VersionIdsForRule(service, ruleId.Value) : null;

            var rows = QueryLogEntries(service, fromUtc, versionIds, out var truncated);
            var summary = AnalyticsAggregator.Aggregate(rows, fromUtc, toUtc, topVersions: 10);
            var labels = ResolveVersionLabels(service, summary.TopVersions.Select(v => v.VersionKey));

            return new
            {
                periodDays,
                from = fromUtc.ToString("o"),
                to = toUtc.ToString("o"),
                ruleId,
                total = summary.Total,
                matched = summary.Matched,
                noMatch = summary.NoMatch,
                error = summary.Error,
                matchRate = summary.MatchRate,
                errorRate = summary.ErrorRate,
                latency = new { avgMs = summary.Latency.AvgMs, p50Ms = summary.Latency.P50Ms, p95Ms = summary.Latency.P95Ms, maxMs = summary.Latency.MaxMs },
                byDay = summary.ByDay.Select(b => new { date = b.Date, count = b.Count, errors = b.Errors }).ToList(),
                topRules = summary.TopVersions.Select(v => new
                {
                    versionKey = v.VersionKey,
                    label = labels.TryGetValue(v.VersionKey, out var l) ? l : (v.VersionKey == "adhoc" ? "Ad-hoc test" : v.VersionKey),
                    count = v.Count,
                    errors = v.Errors
                }).ToList(),
                truncated
            };
        }

        private static int ParsePeriodDays(string? raw)
        {
            if (!int.TryParse(raw, out var days)) return 30;
            return Math.Min(Math.Max(days, 1), 365);
        }

        private static Guid[] VersionIdsForRule(IOrganizationService service, Guid ruleId)
        {
            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid"),
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId) } }
            };
            return service.RetrieveMultiple(query).Entities.Select(e => e.Id).ToArray();
        }

        private static List<LogEntry> QueryLogEntries(IOrganizationService service, DateTime fromUtc, Guid[]? versionIds, out bool truncated)
        {
            truncated = false;
            var entries = new List<LogEntry>();
            if (versionIds != null && versionIds.Length == 0) return entries; // rule with no versions → no logs

            var query = new QueryExpression("qdb_edp_ruleexecutionlog")
            {
                ColumnSet = new ColumnSet("qdb_edp_outcome", "qdb_edp_durationms", "qdb_edp_executedon", "qdb_edp_resolvedversion", "qdb_edp_ruleversionid"),
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_executedon", ConditionOperator.GreaterEqual, fromUtc) } },
                PageInfo = new PagingInfo { Count = AnalyticsPageSize, PageNumber = 1 }
            };
            if (versionIds != null)
                query.Criteria.AddCondition("qdb_edp_ruleversionid", ConditionOperator.In, versionIds.Cast<object>().ToArray());

            while (true)
            {
                var page = service.RetrieveMultiple(query);
                foreach (var e in page.Entities)
                {
                    var versionRef = e.GetAttributeValue<EntityReference>("qdb_edp_ruleversionid");
                    entries.Add(new LogEntry
                    {
                        Outcome = e.GetAttributeValue<string>("qdb_edp_outcome") ?? "",
                        DurationMs = e.GetAttributeValue<int>("qdb_edp_durationms"),
                        ExecutedOnUtc = e.GetAttributeValue<DateTime>("qdb_edp_executedon"),
                        VersionKey = versionRef?.Id.ToString() ?? (e.GetAttributeValue<string>("qdb_edp_resolvedversion") ?? "adhoc")
                    });
                    if (entries.Count >= MaxAnalyticsRows) { truncated = true; return entries; }
                }
                if (!page.MoreRecords) return entries;
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }

        // Label the busiest version keys as "Rule name v{n}"; non-GUID keys (e.g. "adhoc") are skipped.
        private static Dictionary<string, string> ResolveVersionLabels(IOrganizationService service, IEnumerable<string> versionKeys)
        {
            var ids = versionKeys.Where(k => Guid.TryParse(k, out _)).Select(Guid.Parse).Cast<object>().ToArray();
            var labels = new Dictionary<string, string>();
            if (ids.Length == 0) return labels;

            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleversionid", "qdb_edp_versionnumber", "qdb_edp_ruleid"),
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleversionid", ConditionOperator.In, ids) } }
            };
            foreach (var v in service.RetrieveMultiple(query).Entities)
            {
                var number = v.GetAttributeValue<int>("qdb_edp_versionnumber");
                var ruleName = v.GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Name;
                labels[v.Id.ToString()] = string.IsNullOrWhiteSpace(ruleName) ? $"Version {number}" : $"{ruleName} v{number}";
            }
            return labels;
        }

        // ---- shared helpers ------------------------------------------------------------

        /// <summary>
        /// PCRM source: explicit PcrmJson wins; else resolve from a saved version. Execution ops
        /// require the version to be Published (F-01); Validate/Test may resolve a Draft.
        /// </summary>
        private string ResolvePcrm(IOrganizationService service, IPluginExecutionContext context, bool requirePublished)
        {
            var pcrmJson = ParamString(context, "PcrmJson");
            if (!string.IsNullOrWhiteSpace(pcrmJson))
            {
                if (pcrmJson!.Length > MaxPcrmJsonLength)
                    throw new InvalidPluginExecutionException($"PcrmJson exceeds the {MaxPcrmJsonLength} character limit.");
                return pcrmJson;
            }
            var ruleVersionId = ParamGuid(context, "RuleVersionId")
                                ?? throw new InvalidPluginExecutionException("Provide PcrmJson or RuleVersionId.");
            var record = service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new ColumnSet("qdb_edp_pcrmjson", "qdb_edp_lifecyclestate"));

            if (requirePublished && record.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value != LifecyclePublished)
                throw new InvalidPluginExecutionException($"Rule version {ruleVersionId} is not Published and cannot be executed.");

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
            // pcrmJson! — the guard above throws on null; net462 lacks [NotNullWhen] on IsNullOrWhiteSpace.
            return JsonSerializer.Deserialize<PcrmDocument>(pcrmJson!, PcrmOptions)
                   ?? throw new InvalidPluginExecutionException("PCRM payload could not be parsed.");
        }

        private static object SerializeResult(RuleResult result, string executionSource) => new
        {
            executionSource,
            success = result.Success,
            matched = result.Matched,
            outputs = result.Outputs,
            reasonCodes = result.ReasonCodes,
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

        private static DateTime? ParamDate(IPluginExecutionContext context, string name)
        {
            var raw = ParamString(context, name);
            return string.IsNullOrWhiteSpace(raw)
                ? (DateTime?)null
                : DateTime.Parse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Static-analysis / intelligence Functions over stored PCRM (Phase 4 dependency &amp;
    /// comparison, Phase 6 explanation &amp; optimization). All read-only, deterministic, and
    /// off the eval path (ADR-AI-02/05/07): they parse PCRM and project findings; they
    /// never execute a rule, call an AI provider, or mutate data. A single THIN adapter
    /// backing four Custom API Functions, branching on the invoked message name.
    ///
    ///   qdb_edp_GetDependencies  — fields/variables/functions/outputs a rule depends on
    ///   qdb_edp_CompareVersions  — structural diff of two rule versions' PCRM
    ///   qdb_edp_ExplainRule      — business + technical narration of a rule's structure
    ///   qdb_edp_AnalyzeRule      — optimization findings (duplicate/unused/overlap)
    /// </summary>
    public sealed class RuleAnalysisPlugin : IPlugin
    {
        private static readonly JsonSerializerOptions PcrmOptions =
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        private static readonly Regex FunctionCall = new Regex(@"([A-Za-z_][A-Za-z0-9_]*)\s*\(", RegexOptions.Compiled);

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
                    case "qdb_edp_GetDependencies": result = GetDependencies(ResolveDoc(service, context)); break;
                    case "qdb_edp_CompareVersions": result = CompareVersions(service, context); break;
                    case "qdb_edp_ExplainRule": result = ExplainRule(ResolveDoc(service, context)); break;
                    case "qdb_edp_AnalyzeRule": result = AnalyzeRule(ResolveDoc(service, context)); break;
                    default: throw new InvalidPluginExecutionException($"Unsupported analysis message '{context.MessageName}'.");
                }
                context.OutputParameters["ResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP rule analysis failed: {ex.Message}", ex);
            }
        }

        // ---- Dependencies (Phase 4) ----------------------------------------------------

        private object GetDependencies(PcrmDocument doc)
        {
            var fields = doc.Inputs
                .Select(i => new { name = i.Name, binding = i.Binding ?? i.Name, type = i.Type })
                .ToList();
            var functions = CollectFunctionNames(doc).OrderBy(x => x).ToList();
            return new
            {
                ruleName = doc.Name,
                targetEntity = doc.TargetEntity,
                logicType = doc.Logic.Type,
                fields,
                variables = doc.Variables.Select(v => new { name = v.Name, type = v.Type }).ToList(),
                functions,
                outputs = DeclaredOutputs(doc).Select(o => new { name = o.Name, type = o.Type }).ToList(),
                edges = BuildEdges(doc, fields.Select(f => f.binding), functions)
            };
        }

        private static object BuildEdges(PcrmDocument doc, IEnumerable<string> fieldBindings, IEnumerable<string> functions)
        {
            var edges = new List<object>();
            var rule = string.IsNullOrWhiteSpace(doc.Name) ? "rule" : doc.Name;
            edges.Add(new { from = rule, to = doc.TargetEntity, type = "targets-entity" });
            foreach (var f in fieldBindings) edges.Add(new { from = rule, to = f, type = "reads-field" });
            foreach (var fn in functions) edges.Add(new { from = rule, to = fn, type = "uses-function" });
            foreach (var v in doc.Variables) edges.Add(new { from = rule, to = v.Name, type = "computes-variable" });
            return edges;
        }

        // ---- Compare (Phase 4) ---------------------------------------------------------

        private object CompareVersions(IOrganizationService service, IPluginExecutionContext context)
        {
            var idA = ParamGuid(context, "RuleVersionIdA") ?? throw new InvalidPluginExecutionException("Provide RuleVersionIdA.");
            var idB = ParamGuid(context, "RuleVersionIdB") ?? throw new InvalidPluginExecutionException("Provide RuleVersionIdB.");
            var a = ParsePcrm(RetrievePcrm(service, idA));
            var b = ParsePcrm(RetrievePcrm(service, idB));

            var inputsA = a.Inputs.ToDictionary(i => i.Name, i => i.Type, StringComparer.OrdinalIgnoreCase);
            var inputsB = b.Inputs.ToDictionary(i => i.Name, i => i.Type, StringComparer.OrdinalIgnoreCase);
            var outA = DeclaredOutputs(a).Select(o => o.Name).ToList();
            var outB = DeclaredOutputs(b).Select(o => o.Name).ToList();

            return new
            {
                versionA = idA,
                versionB = idB,
                logicTypeChanged = !string.Equals(a.Logic.Type, b.Logic.Type, StringComparison.OrdinalIgnoreCase),
                logicType = new { a = a.Logic.Type, b = b.Logic.Type },
                inputs = new
                {
                    added = inputsB.Keys.Except(inputsA.Keys, StringComparer.OrdinalIgnoreCase).ToList(),
                    removed = inputsA.Keys.Except(inputsB.Keys, StringComparer.OrdinalIgnoreCase).ToList(),
                    typeChanged = inputsA.Keys.Intersect(inputsB.Keys, StringComparer.OrdinalIgnoreCase)
                        .Where(k => !string.Equals(inputsA[k], inputsB[k], StringComparison.OrdinalIgnoreCase))
                        .Select(k => new { input = k, from = inputsA[k], to = inputsB[k] }).ToList()
                },
                outputs = new
                {
                    added = outB.Except(outA, StringComparer.OrdinalIgnoreCase).ToList(),
                    removed = outA.Except(outB, StringComparer.OrdinalIgnoreCase).ToList()
                },
                branchCount = new { a = BranchCount(a), b = BranchCount(b) }
            };
        }

        // ---- Explain (Phase 6, grounded in structure) ----------------------------------

        private object ExplainRule(PcrmDocument doc)
        {
            var inputs = doc.Inputs.Select(i => i.Name).ToList();
            var outputs = DeclaredOutputs(doc).Select(o => o.Name).ToList();
            var branches = BranchCount(doc);
            var shape = string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase)
                ? $"a decision table of {branches} row(s) over {doc.Logic.TableInputs.Count} input column(s)"
                : $"a condition set with {branches} conditional branch(es)";

            var business = new StringBuilder()
                .Append($"Rule '{doc.Name}' decides {(outputs.Count == 0 ? "an outcome" : string.Join(", ", outputs))} ")
                .Append($"from {(inputs.Count == 0 ? "its inputs" : string.Join(", ", inputs))}. ")
                .Append($"It is {shape}.")
                .ToString();

            return new
            {
                ruleName = doc.Name,
                business,
                technical = new
                {
                    targetEntity = doc.TargetEntity,
                    logicType = doc.Logic.Type,
                    inputs = doc.Inputs.Select(i => new { i.Name, i.Type }).ToList(),
                    outputs,
                    variableCount = doc.Variables.Count,
                    branchCount = branches
                }
            };
        }

        // ---- Analyze / optimize (Phase 6, static) --------------------------------------

        private object AnalyzeRule(PcrmDocument doc)
        {
            var findings = new List<object>();

            // Unused variables: declared but never referenced by name anywhere.
            var referenced = ReferencedSymbols(doc);
            foreach (var v in doc.Variables)
                if (!referenced.Contains(v.Name))
                    findings.Add(new { type = "unused-variable", target = v.Name, message = $"Variable '{v.Name}' is declared but never referenced." });

            // Unused declared outputs: declared in outputs[] but never produced.
            var produced = ProducedOutputs(doc);
            foreach (var o in doc.Outputs)
                if (!produced.Contains(o.Name))
                    findings.Add(new { type = "unused-output", target = o.Name, message = $"Output '{o.Name}' is declared but never produced by any branch." });

            // Duplicate conditions within a condition-set branch.
            if (!string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var rule in doc.Logic.Rules)
                    foreach (var dup in DuplicateConditions(rule.When))
                        findings.Add(new { type = "duplicate-condition", target = dup, message = $"Condition '{dup}' appears more than once in the same branch." });
            }
            else
            {
                // Duplicate decision-table rows (identical cell signature).
                var seen = new HashSet<string>();
                for (var r = 0; r < doc.Logic.Rows.Count; r++)
                {
                    var sig = RowSignature(doc.Logic.Rows[r]);
                    if (!seen.Add(sig))
                        findings.Add(new { type = "duplicate-row", target = $"row[{r}]", message = "Two decision-table rows have identical condition cells (potential redundancy/conflict)." });
                }
            }

            return new
            {
                ruleName = doc.Name,
                findingCount = findings.Count,
                findings,
                note = "Best-effort static analysis over PCRM (first cut). Cross-rule conflict/duplicate detection is a portfolio-scan follow-up."
            };
        }

        // ---- PCRM helpers --------------------------------------------------------------

        private sealed class OutputInfo
        {
            public OutputInfo(string name, string type) { Name = name; Type = type; }
            public string Name { get; }
            public string Type { get; }
        }

        private static List<OutputInfo> DeclaredOutputs(PcrmDocument doc)
        {
            var outs = doc.Outputs.Select(o => new OutputInfo(o.Name, o.Type)).ToList();
            var seen = new HashSet<string>(outs.Select(o => o.Name), StringComparer.OrdinalIgnoreCase);
            foreach (var col in doc.Logic.OutputColumns)
                if (seen.Add(col)) outs.Add(new OutputInfo(col, "Text"));
            return outs;
        }

        private static int BranchCount(PcrmDocument doc)
            => string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase)
                ? doc.Logic.Rows.Count
                : doc.Logic.Rules.Count;

        private static HashSet<string> CollectFunctionNames(PcrmDocument doc)
        {
            var fns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var v in doc.Variables)
                foreach (Match m in FunctionCall.Matches(v.Formula ?? ""))
                    fns.Add(m.Groups[1].Value);
            return fns;
        }

        /// <summary>Symbols referenced by conditions (fields), formulas, and table inputs.</summary>
        private static HashSet<string> ReferencedSymbols(PcrmDocument doc)
        {
            var refs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var v in doc.Variables)
                foreach (Match m in Regex.Matches(v.Formula ?? "", @"[A-Za-z_][A-Za-z0-9_]*"))
                    refs.Add(m.Value);
            if (string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase))
                foreach (var ti in doc.Logic.TableInputs) refs.Add(ti.Field);
            else
                foreach (var rule in doc.Logic.Rules) CollectFields(rule.When, refs);
            return refs;
        }

        private static void CollectFields(PcrmGroup group, HashSet<string> into)
        {
            foreach (var c in group.Conditions) into.Add(c.Field);
            foreach (var g in group.Groups) CollectFields(g, into);
        }

        private static HashSet<string> ProducedOutputs(PcrmDocument doc)
        {
            var produced = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (string.Equals(doc.Logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var col in doc.Logic.OutputColumns) produced.Add(col);
                foreach (var row in doc.Logic.Rows) foreach (var k in row.Outputs.Keys) produced.Add(k);
            }
            else
            {
                foreach (var rule in doc.Logic.Rules) foreach (var k in rule.Then.Keys) produced.Add(k);
                if (doc.Logic.Otherwise != null) foreach (var k in doc.Logic.Otherwise.Keys) produced.Add(k);
            }
            return produced;
        }

        private static IEnumerable<string> DuplicateConditions(PcrmGroup group)
        {
            var seen = new HashSet<string>();
            var dups = new List<string>();
            void Walk(PcrmGroup g)
            {
                foreach (var c in g.Conditions)
                {
                    var sig = $"{c.Field}|{c.Operator}|{SafeRaw(c.Value)}";
                    if (!seen.Add(sig)) dups.Add($"{c.Field} {c.Operator} {SafeRaw(c.Value)}");
                }
                foreach (var ng in g.Groups) Walk(ng);
            }
            Walk(group);
            return dups;
        }

        private static string RowSignature(PcrmTableRow row)
            => string.Join(";", row.Cells.Select(c => c.Any ? "*" : $"{c.Operator}|{SafeRaw(c.Value)}"));

        private static string SafeRaw(JsonElement e)
        {
            try { return e.ValueKind == JsonValueKind.Undefined ? "" : e.GetRawText(); }
            catch { return ""; }
        }

        private PcrmDocument ResolveDoc(IOrganizationService service, IPluginExecutionContext context)
        {
            var pcrmJson = ParamString(context, "PcrmJson");
            if (string.IsNullOrWhiteSpace(pcrmJson))
            {
                var id = ParamGuid(context, "RuleVersionId") ?? throw new InvalidPluginExecutionException("Provide PcrmJson or RuleVersionId.");
                pcrmJson = RetrievePcrm(service, id);
            }
            return ParsePcrm(pcrmJson);
        }

        private static string RetrievePcrm(IOrganizationService service, Guid ruleVersionId)
        {
            var record = service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new ColumnSet("qdb_edp_pcrmjson"));
            var pcrm = record.GetAttributeValue<string>("qdb_edp_pcrmjson");
            if (string.IsNullOrWhiteSpace(pcrm))
                throw new InvalidPluginExecutionException($"Rule version {ruleVersionId} has no PCRM payload.");
            return pcrm!;
        }

        private static PcrmDocument ParsePcrm(string? pcrmJson)
            => JsonSerializer.Deserialize<PcrmDocument>(pcrmJson!, PcrmOptions)
               ?? throw new InvalidPluginExecutionException("PCRM payload could not be parsed.");

        private static string? ParamString(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;

        private static Guid? ParamGuid(IPluginExecutionContext context, string name)
        {
            var raw = ParamString(context, name);
            return string.IsNullOrWhiteSpace(raw) ? (Guid?)null : Guid.Parse(raw);
        }
    }
}

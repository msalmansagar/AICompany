using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Enterprise Decision Service — read-only metadata/schema Functions (ADR-EDS-03).
    /// A single THIN adapter backing four Custom API Functions; it branches on the
    /// invoked message name. It resolves a rule version, reads its stored PCRM, and
    /// projects a discovery contract. It NEVER executes a rule and NEVER mutates data
    /// (Command-Query Separation): every branch is a pure query.
    ///
    /// Backed messages (all unbound Functions, response property ResultJson):
    ///   qdb_edp_GetInputSchema     — declared inputs (name/type/binding)
    ///   qdb_edp_GetOutputSchema    — declared outputs (name/type)
    ///   qdb_edp_GetRuleMetadata    — rule/version summary + declared-object counts
    ///   qdb_edp_GetPublishedVersion — resolve business identity -> published version
    ///
    /// Version resolution (in order): RuleVersionId (direct) -> RuleId/RuleName +
    /// optional Version number -> latest Published version. The caller references a
    /// rule by business identity; version selection stays inside the service (ADR-09).
    /// </summary>
    public sealed class RuleMetadataPlugin : IPlugin
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
                var version = ResolveVersion(service, context);
                var result = Project(context.MessageName, version);
                context.OutputParameters["ResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP metadata query failed: {ex.Message}", ex);
            }
        }

        /// <summary>Resolve the target rule version record from business identity.</summary>
        private static Entity ResolveVersion(IOrganizationService service, IPluginExecutionContext context)
        {
            var columns = new ColumnSet(
                "qdb_edp_ruleversionid", "qdb_edp_ruleversionname", "qdb_edp_pcrmjson",
                "qdb_edp_versionnumber", "qdb_edp_lifecyclestate", "qdb_edp_ispinned", "qdb_edp_ruleid");

            var ruleVersionId = ParamGuid(context, "RuleVersionId");
            if (ruleVersionId.HasValue)
                return service.Retrieve("qdb_edp_ruleversion", ruleVersionId.Value, columns);

            var ruleId = ParamGuid(context, "RuleId") ?? ResolveRuleIdByName(service, ParamString(context, "RuleName"));
            if (!ruleId.HasValue)
                throw new InvalidPluginExecutionException("Provide RuleVersionId, RuleId, or RuleName.");

            var query = new QueryExpression("qdb_edp_ruleversion")
            {
                ColumnSet = columns,
                TopCount = 1,
                Orders = { new OrderExpression("qdb_edp_versionnumber", OrderType.Descending) },
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId.Value) } }
            };

            var versionNumber = ParamInt(context, "Version");
            if (versionNumber.HasValue)
                query.Criteria.AddCondition("qdb_edp_versionnumber", ConditionOperator.Equal, versionNumber.Value);
            else
                query.Criteria.AddCondition("qdb_edp_lifecyclestate", ConditionOperator.Equal, LifecyclePublished);

            var found = service.RetrieveMultiple(query).Entities.FirstOrDefault()
                        ?? throw new InvalidPluginExecutionException("No matching rule version was found.");
            return found;
        }

        private static Guid? ResolveRuleIdByName(IOrganizationService service, string? ruleName)
        {
            if (string.IsNullOrWhiteSpace(ruleName)) return null;
            var query = new QueryExpression("qdb_edp_rule")
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleid"),
                TopCount = 1,
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_rulename", ConditionOperator.Equal, ruleName) } }
            };
            var rule = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return rule?.Id;
        }

        /// <summary>Branch the projection by the invoked message name (one adapter, four contracts).</summary>
        private static object Project(string messageName, Entity version)
        {
            switch (messageName)
            {
                case "qdb_edp_GetInputSchema": return InputSchema(version);
                case "qdb_edp_GetOutputSchema": return OutputSchema(version);
                case "qdb_edp_GetRuleMetadata": return Metadata(version);
                case "qdb_edp_GetPublishedVersion": return PublishedVersion(version);
                default:
                    throw new InvalidPluginExecutionException($"Unsupported metadata message '{messageName}'.");
            }
        }

        private static object InputSchema(Entity version)
        {
            var pcrm = ParsePcrm(version);
            return new
            {
                ruleVersionId = version.Id,
                ruleName = pcrm.Name,
                targetEntity = pcrm.TargetEntity,
                inputs = pcrm.Inputs.Select(i => new { name = i.Name, type = i.Type, binding = i.Binding ?? i.Name }).ToList()
            };
        }

        private static object OutputSchema(Entity version)
        {
            var pcrm = ParsePcrm(version);
            var outputs = new List<object>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var o in pcrm.Outputs)
                if (seen.Add(o.Name)) outputs.Add(new { name = o.Name, type = o.Type });
            // Decision-table outputs are declared as output columns; include any not already listed.
            foreach (var col in pcrm.Logic.OutputColumns)
                if (seen.Add(col)) outputs.Add(new { name = col, type = "Text" });
            return new { ruleVersionId = version.Id, ruleName = pcrm.Name, outputs };
        }

        private static object Metadata(Entity version)
        {
            var pcrm = ParsePcrm(version);
            return new
            {
                ruleVersionId = version.Id,
                ruleId = version.GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Id,
                name = pcrm.Name,
                schemaVersion = pcrm.SchemaVersion,
                targetEntity = pcrm.TargetEntity,
                logicType = pcrm.Logic.Type,
                versionNumber = version.GetAttributeValue<int>("qdb_edp_versionnumber"),
                lifecycleState = LifecycleValue(version),
                lifecycleLabel = LifecycleLabel(LifecycleValue(version)),
                isPinned = version.GetAttributeValue<bool>("qdb_edp_ispinned"),
                counts = new { inputs = pcrm.Inputs.Count, outputs = pcrm.Outputs.Count, variables = pcrm.Variables.Count }
            };
        }

        private static object PublishedVersion(Entity version)
        {
            var state = LifecycleValue(version);
            return new
            {
                ruleId = version.GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Id,
                ruleVersionId = version.Id,
                versionNumber = version.GetAttributeValue<int>("qdb_edp_versionnumber"),
                lifecycleState = state,
                lifecycleLabel = LifecycleLabel(state),
                isPublished = state == LifecyclePublished,
                isPinned = version.GetAttributeValue<bool>("qdb_edp_ispinned")
            };
        }

        private static PcrmDocument ParsePcrm(Entity version)
        {
            var pcrmJson = version.GetAttributeValue<string>("qdb_edp_pcrmjson");
            if (string.IsNullOrWhiteSpace(pcrmJson))
                throw new InvalidPluginExecutionException("The resolved rule version has no PCRM payload.");
            return JsonSerializer.Deserialize<PcrmDocument>(pcrmJson, PcrmOptions)
                   ?? throw new InvalidPluginExecutionException("The PCRM payload could not be parsed.");
        }

        private static int LifecycleValue(Entity version)
            => version.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value ?? -1;

        private static string LifecycleLabel(int value)
        {
            switch (value)
            {
                case 100000000: return "Draft";
                case 100000001: return "In Review";
                case 100000002: return "Approved";
                case 100000003: return "Published";
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

        private static int? ParamInt(IPluginExecutionContext context, string name)
        {
            var raw = ParamString(context, name);
            return string.IsNullOrWhiteSpace(raw) ? (int?)null : int.Parse(raw);
        }
    }
}

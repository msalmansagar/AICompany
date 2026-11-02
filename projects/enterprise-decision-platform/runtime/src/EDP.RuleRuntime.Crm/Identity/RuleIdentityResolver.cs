using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Contract;

namespace EDP.RuleRuntime.Crm.Identity
{
    /// <summary>The identifiers a caller supplied; any may be absent.</summary>
    public sealed class RuleIdentityRequest
    {
        public Guid? RuleVersionId { get; set; }
        public Guid? RuleId { get; set; }
        public string? RuleKey { get; set; }
        public string? RuleName { get; set; }

        public bool IsEmpty => !RuleVersionId.HasValue && !RuleId.HasValue
                               && string.IsNullOrWhiteSpace(RuleKey) && string.IsNullOrWhiteSpace(RuleName);

        /// <summary>Read the four standard identifier parameters from a plug-in context.</summary>
        public static RuleIdentityRequest FromContext(IPluginExecutionContext context) => new RuleIdentityRequest
        {
            RuleVersionId = ParamGuid(context, "RuleVersionId"),
            RuleId = ParamGuid(context, "RuleId"),
            RuleKey = ParamText(context, "RuleKey"),
            RuleName = ParamText(context, "RuleName"),
        };

        private static string? ParamText(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;

        private static Guid? ParamGuid(IPluginExecutionContext context, string name)
        {
            var raw = ParamText(context, name);
            return string.IsNullOrWhiteSpace(raw) ? (Guid?)null : Guid.Parse(raw);
        }
    }

    /// <summary>Which rule a request addressed, and how (ADR-21).</summary>
    public sealed class RuleIdentity
    {
        public RuleIdentity(Guid? ruleId, string? ruleKey, string? ruleName, int nameMatchCount)
        {
            RuleId = ruleId;
            RuleKey = ruleKey;
            RuleName = ruleName;
            NameMatchCount = nameMatchCount;
        }

        /// <summary>Null only for an orphaned version: one whose parent rule no longer exists.</summary>
        public Guid? RuleId { get; }
        public string? RuleKey { get; }
        public string? RuleName { get; }

        /// <summary>Rules sharing the requested name; 0 when the rule was not addressed by name.</summary>
        public int NameMatchCount { get; }
        public bool NameIsAmbiguous => NameMatchCount > 1;

        /// <summary>The rule id, for operations that are about a rule rather than one version of it.</summary>
        public Guid RequireRuleId()
            => RuleId ?? throw new InvalidPluginExecutionException("The rule version is not linked to a rule, so it has no rule history, documentation or effective version.");
    }

    /// <summary>
    /// The one place a rule is resolved from business identity (IC-1, FR-B3-06/08).
    /// Precedence is RuleVersionId → RuleId → RuleKey → RuleName; every other identifier supplied
    /// must describe the same rule or the call fails with EDP070. A name lookup is deterministic:
    /// earliest createdon, then lowest id. Failures throw InvalidPluginExecutionException, which
    /// Dataverse returns as HTTP 400 (a malformed request, FR-B2-06).
    /// </summary>
    public sealed class RuleIdentityResolver
    {
        private const string RuleEntity = "qdb_edp_rule";
        private readonly IOrganizationService _service;

        public RuleIdentityResolver(IOrganizationService service)
            => _service = service ?? throw new ArgumentNullException(nameof(service));

        public RuleIdentity Resolve(RuleIdentityRequest request)
        {
            if (request.IsEmpty)
                throw new InvalidPluginExecutionException("Provide RuleVersionId, RuleId, RuleKey, or RuleName.");
            if (!string.IsNullOrWhiteSpace(request.RuleKey) && !EngineContract.Current.IsValidRuleKey(request.RuleKey))
                throw Refuse("EDP071", $"RuleKey '{request.RuleKey}' does not match the key format (lower-case, 3-100 characters).");

            var primary = ResolvePrimary(request);
            if (!primary.RuleId.HasValue) return OrphanedVersion(request);
            var rule = ReadRule(primary.RuleId.Value);
            EnsureConsistent(request, primary.RuleId.Value, rule);
            return new RuleIdentity(primary.RuleId, rule.GetAttributeValue<string>("qdb_edp_rulekey"),
                rule.GetAttributeValue<string>("qdb_edp_rulename"), primary.NameMatchCount);
        }

        /// <summary>
        /// Versions whose parent rule was lost (the pre-DSN-002 create defect left three in the org)
        /// stay addressable by RuleVersionId, as before 1.1.0. No other identifier can name them.
        /// </summary>
        private static RuleIdentity OrphanedVersion(RuleIdentityRequest request)
        {
            if (request.RuleId.HasValue || !string.IsNullOrWhiteSpace(request.RuleKey) || !string.IsNullOrWhiteSpace(request.RuleName))
                throw Conflict("RuleVersionId");
            return new RuleIdentity(null, null, null, 0);
        }

        private (Guid? RuleId, int NameMatchCount) ResolvePrimary(RuleIdentityRequest request)
        {
            if (request.RuleVersionId.HasValue) return (RuleOfVersion(request.RuleVersionId.Value), 0);
            if (request.RuleId.HasValue) return (request.RuleId.Value, 0);
            if (!string.IsNullOrWhiteSpace(request.RuleKey)) return (RuleByKey(request.RuleKey!), 0);
            var named = RulesByName(request.RuleName!);
            if (named.Count == 0) throw new InvalidPluginExecutionException($"No rule is named '{request.RuleName}'.");
            return (named[0].Id, named.Count);
        }

        /// <summary>EDP070: a lower-precedence identifier names a different rule than the one resolved.</summary>
        private static void EnsureConsistent(RuleIdentityRequest request, Guid resolvedRuleId, Entity rule)
        {
            if (request.RuleVersionId.HasValue && request.RuleId.HasValue && request.RuleId.Value != resolvedRuleId)
                throw Conflict("RuleId");
            if (!string.IsNullOrWhiteSpace(request.RuleKey)
                && !string.Equals(rule.GetAttributeValue<string>("qdb_edp_rulekey"), request.RuleKey, StringComparison.Ordinal))
                throw Conflict("RuleKey");
            if (!string.IsNullOrWhiteSpace(request.RuleName)
                && !string.Equals(rule.GetAttributeValue<string>("qdb_edp_rulename"), request.RuleName, StringComparison.OrdinalIgnoreCase))
                throw Conflict("RuleName");
        }

        private Guid? RuleOfVersion(Guid ruleVersionId)
            => _service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new ColumnSet("qdb_edp_ruleid"))
                .GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Id;

        /// <summary>Keys are compared exactly: a stored key always equals its lookup text (FR-B3-13).</summary>
        private Guid RuleByKey(string ruleKey)
        {
            var matches = QueryRules("qdb_edp_rulekey", ruleKey)
                .Where(r => string.Equals(r.GetAttributeValue<string>("qdb_edp_rulekey"), ruleKey, StringComparison.Ordinal))
                .ToList();
            if (matches.Count == 0) throw new InvalidPluginExecutionException($"No rule has RuleKey '{ruleKey}'.");
            if (matches.Count > 1)
                throw new InvalidPluginExecutionException($"RuleKey '{ruleKey}' is held by {matches.Count} rules; keys are not yet unique in this environment.");
            return matches[0].Id;
        }

        /// <summary>Every rule with this display name, in the deterministic order that picks the winner.</summary>
        private List<Entity> RulesByName(string ruleName)
            => QueryRules("qdb_edp_rulename", ruleName)
                .Where(r => string.Equals(r.GetAttributeValue<string>("qdb_edp_rulename"), ruleName, StringComparison.OrdinalIgnoreCase))
                .OrderBy(r => r.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MaxValue)
                .ThenBy(r => r.Id)
                .ToList();

        private IEnumerable<Entity> QueryRules(string attribute, string value)
        {
            var query = new QueryExpression(RuleEntity)
            {
                ColumnSet = new ColumnSet("qdb_edp_ruleid", "qdb_edp_rulename", "qdb_edp_rulekey", "createdon"),
                Orders = { new OrderExpression("createdon", OrderType.Ascending), new OrderExpression("qdb_edp_ruleid", OrderType.Ascending) },
                Criteria = { Conditions = { new ConditionExpression(attribute, ConditionOperator.Equal, value) } },
            };
            return _service.RetrieveMultiple(query).Entities;
        }

        private Entity ReadRule(Guid ruleId)
            => _service.Retrieve(RuleEntity, ruleId, new ColumnSet("qdb_edp_rulename", "qdb_edp_rulekey"));

        private static InvalidPluginExecutionException Conflict(string identifier)
            => Refuse("EDP070", $"The identifiers supplied name different rules: {identifier} does not match the rule resolved from the other identifiers.");

        private static InvalidPluginExecutionException Refuse(string code, string message)
            => new InvalidPluginExecutionException($"{code}: {message}");
    }
}

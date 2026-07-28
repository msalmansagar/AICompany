using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Enforces a report's own access list (designer tab 11) on top of Dataverse security.
    ///
    /// This runs in the plugin because it is the only place it can mean anything: the browser holds
    /// the rows once they are returned, so a check made there would be advice, not a boundary.
    ///
    /// Two deliberate rules:
    /// - A report with no access rows is unrestricted. Reports written before this existed keep
    ///   working, and an empty list is read as "nobody has restricted this yet" rather than
    ///   "nobody may run it", which would silently break every existing report.
    /// - Only <c>canexecute</c> is enforced. Export, edit and approve are stored and shown, but the
    ///   browser already has the data by the time it exports, so claiming to enforce export here
    ///   would be theatre. Said plainly rather than implied.
    ///
    /// Principals are matched by NAME, which is what the designer captures — a role or team is named,
    /// not picked by id. Matching is case-insensitive and trimmed.
    /// </summary>
    internal sealed class ReportAccessGuard
    {
        private const string SecurityEntity = "qdb_reportsecurity";

        // qdb_principaltype
        private const int PrincipalUser = 100000000;
        private const int PrincipalTeam = 100000001;
        private const int PrincipalSecurityRole = 100000002;
        private const int PrincipalBusinessUnit = 100000003;

        private readonly IOrganizationService _asSystem;

        /// <summary>Reads with the system identity: a user may not be able to see role membership, and
        /// a check that fails because the caller cannot read the rules is a check that fails open.</summary>
        public ReportAccessGuard(IOrganizationService asSystem) => _asSystem = asSystem;

        public void DemandExecute(Guid reportId, Guid userId)
        {
            var rules = LoadRules(reportId);
            if (rules.Count == 0)
            {
                return;
            }

            var principals = PrincipalsOf(userId);
            foreach (var rule in rules)
            {
                if (rule.GetAttributeValue<bool>("qdb_canexecute") && Matches(rule, principals))
                {
                    return;
                }
            }

            throw new InvalidPluginExecutionException(
                "You do not have permission to run this report. Its access list does not include you.");
        }

        private List<Entity> LoadRules(Guid reportId)
        {
            var query = new QueryExpression(SecurityEntity)
            {
                ColumnSet = new ColumnSet("qdb_principaltype", "qdb_principalidtext", "qdb_canexecute")
            };
            query.Criteria.AddCondition("qdb_reportdefinitionid", ConditionOperator.Equal, reportId);
            return new List<Entity>(_asSystem.RetrieveMultiple(query).Entities);
        }

        private static bool Matches(Entity rule, CallerPrincipals principals)
        {
            var reference = (rule.GetAttributeValue<string>("qdb_principalidtext") ?? string.Empty).Trim();
            if (reference.Length == 0)
            {
                return false;
            }

            switch (rule.GetAttributeValue<OptionSetValue>("qdb_principaltype")?.Value)
            {
                case PrincipalUser: return principals.IsUser(reference);
                case PrincipalTeam: return principals.Teams.Contains(reference, StringComparer.OrdinalIgnoreCase);
                case PrincipalSecurityRole: return principals.Roles.Contains(reference, StringComparer.OrdinalIgnoreCase);
                case PrincipalBusinessUnit: return string.Equals(principals.BusinessUnit, reference, StringComparison.OrdinalIgnoreCase);
                default: return false;
            }
        }

        private CallerPrincipals PrincipalsOf(Guid userId)
        {
            var user = _asSystem.Retrieve("systemuser", userId,
                new ColumnSet("fullname", "domainname", "businessunitid"));

            return new CallerPrincipals
            {
                UserId = userId,
                FullName = user.GetAttributeValue<string>("fullname"),
                DomainName = user.GetAttributeValue<string>("domainname"),
                BusinessUnit = user.GetAttributeValue<EntityReference>("businessunitid")?.Name,
                Roles = NamesOf("role", "roleid", "systemuserroles", "roleid", userId),
                Teams = NamesOf("team", "teamid", "teammembership", "teamid", userId)
            };
        }

        /// <summary>Names of the roles or teams the user belongs to, via the intersect entity.</summary>
        private List<string> NamesOf(string entity, string primaryKey, string intersect, string intersectKey, Guid userId)
        {
            var query = new QueryExpression(entity) { ColumnSet = new ColumnSet("name") };
            var link = query.AddLink(intersect, primaryKey, intersectKey);
            link.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);

            var names = new List<string>();
            foreach (var record in _asSystem.RetrieveMultiple(query).Entities)
            {
                var name = record.GetAttributeValue<string>("name");
                if (!string.IsNullOrEmpty(name)) names.Add(name);
            }

            return names;
        }
    }

    /// <summary>Everything a report's access list can name the caller by.</summary>
    internal sealed class CallerPrincipals
    {
        public Guid UserId { get; set; }

        public string FullName { get; set; }

        public string DomainName { get; set; }

        public string BusinessUnit { get; set; }

        public List<string> Roles { get; set; } = new List<string>();

        public List<string> Teams { get; set; } = new List<string>();

        /// <summary>A user rule may name the id, the login, or the display name — all three are accepted.</summary>
        public bool IsUser(string reference) =>
            string.Equals(reference, UserId.ToString(), StringComparison.OrdinalIgnoreCase)
            || string.Equals(reference, FullName, StringComparison.OrdinalIgnoreCase)
            || string.Equals(reference, DomainName, StringComparison.OrdinalIgnoreCase);
    }
}

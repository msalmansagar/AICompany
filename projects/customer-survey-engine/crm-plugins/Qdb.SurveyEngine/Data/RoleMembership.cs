using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Answers whether a user holds a security role, through the user's own roles or a team's. The
    /// role is named by a condition on the role table (its template id, or its name).
    /// </summary>
    internal static class RoleMembership
    {
        /// <summary>True when the user holds a role matching the condition, directly or through a team.</summary>
        public static bool Holds(IOrganizationService service, Guid userId, ConditionExpression roleCondition) =>
            HoldsDirectly(service, userId, roleCondition) || HoldsThroughTeam(service, userId, roleCondition);

        private static bool HoldsDirectly(IOrganizationService service, Guid userId, ConditionExpression roleCondition)
        {
            var query = RoleQuery(roleCondition);
            var userRoles = query.AddLink("systemuserroles", "roleid", "roleid");
            userRoles.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return service.RetrieveMultiple(query).Entities.Any();
        }

        private static bool HoldsThroughTeam(IOrganizationService service, Guid userId, ConditionExpression roleCondition)
        {
            var query = RoleQuery(roleCondition);
            var membership = query.AddLink("teamroles", "roleid", "roleid").AddLink("teammembership", "teamid", "teamid");
            membership.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return service.RetrieveMultiple(query).Entities.Any();
        }

        private static QueryExpression RoleQuery(ConditionExpression roleCondition)
        {
            var query = new QueryExpression("role") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(roleCondition);
            return query;
        }
    }
}

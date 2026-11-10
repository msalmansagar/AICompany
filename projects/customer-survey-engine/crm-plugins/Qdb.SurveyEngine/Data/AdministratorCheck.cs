using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Checks the System Administrator role by its platform role template, which is the same in
    /// every org and language, through the user's own roles or a team's.
    /// </summary>
    public sealed class AdministratorCheck : IAdministratorCheck
    {
        /// <summary>The platform's fixed role template id of System Administrator.</summary>
        public static readonly Guid SystemAdministratorTemplateId = new Guid("627090FF-40A3-4053-8790-584EDC5BE201");
        private readonly IOrganizationService _service;

        public AdministratorCheck(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public bool IsSystemAdministrator(Guid userId) => HasDirectRole(userId) || HasTeamRole(userId);

        private bool HasDirectRole(Guid userId)
        {
            var query = AdministratorRoleQuery();
            var userRoles = query.AddLink("systemuserroles", "roleid", "roleid");
            userRoles.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        private bool HasTeamRole(Guid userId)
        {
            var query = AdministratorRoleQuery();
            var membership = query.AddLink("teamroles", "roleid", "roleid").AddLink("teammembership", "teamid", "teamid");
            membership.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        private static QueryExpression AdministratorRoleQuery()
        {
            var query = new QueryExpression("role") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("roletemplateid", ConditionOperator.Equal, SystemAdministratorTemplateId);
            return query;
        }
    }
}

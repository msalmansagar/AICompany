using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.OneTime;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Admits a System Administrator or a holder of the Survey Admin role (directly or through a team) to
    /// preview, send or save a One-time trigger. The send runs as SYSTEM, so this gate is what keeps mass
    /// sends with survey administrators (NFR-CSE-017, ADR-009).
    /// </summary>
    public sealed class OneTimeAccessCheck : IOneTimeAccessCheck
    {
        /// <summary>The role created by provisioning (manifest.mjs ROLES); role names are not translated.</summary>
        public const string SurveyAdminRoleName = "Survey Admin";
        private readonly IOrganizationService _service;
        private readonly IAdministratorCheck _administrators;

        public OneTimeAccessCheck(IOrganizationService service, IAdministratorCheck administrators)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _administrators = administrators ?? throw new ArgumentNullException(nameof(administrators));
        }

        /// <inheritdoc />
        public bool MaySendSurveys(Guid userId) =>
            _administrators.IsSystemAdministrator(userId)
            || RoleMembership.Holds(_service, userId, new ConditionExpression("name", ConditionOperator.Equal, SurveyAdminRoleName));
    }
}

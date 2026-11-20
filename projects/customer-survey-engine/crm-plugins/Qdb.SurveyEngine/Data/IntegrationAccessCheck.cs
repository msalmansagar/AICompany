using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Admits a caller of the four integration APIs who is a System Administrator or holds the Survey Integration
    /// role, directly or through a team. The APIs then work as SYSTEM, so the portal backend's account needs no
    /// survey or customer table rights and cannot read other customers' data around the APIs (review item 3,
    /// 2026-11-19; same pattern as <see cref="SchedulerAccessCheck"/> and the erasure API).
    /// </summary>
    public sealed class IntegrationAccessCheck : IIntegrationAccessCheck
    {
        /// <summary>The role created by provisioning (manifest.mjs ROLES) in every org; role names are not translated.</summary>
        public const string SurveyIntegrationRoleName = "Survey Integration";
        private readonly IOrganizationService _service;
        private readonly IAdministratorCheck _administrators;

        public IntegrationAccessCheck(IOrganizationService service, IAdministratorCheck administrators)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _administrators = administrators ?? throw new ArgumentNullException(nameof(administrators));
        }

        /// <inheritdoc />
        public bool MayCallIntegrationApis(Guid userId) =>
            _administrators.IsSystemAdministrator(userId)
            || RoleMembership.Holds(_service, userId, new ConditionExpression("name", ConditionOperator.Equal, SurveyIntegrationRoleName));
    }
}

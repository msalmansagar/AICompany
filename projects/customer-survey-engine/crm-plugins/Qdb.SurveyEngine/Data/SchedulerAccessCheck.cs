using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Admits a caller of qdb_srv_RunDueSurveys who is a System Administrator or holds the Survey Scheduler
    /// role, directly or through a team. The unattended scheduler account holds only Survey Scheduler, which
    /// grants no table rights: the run itself works as SYSTEM (CEO 2026-11-14, Phase 6 audit SEC-01).
    /// </summary>
    public sealed class SchedulerAccessCheck : ISchedulerAccessCheck
    {
        /// <summary>The role created by provisioning (manifest.mjs ROLES) in every org; role names are not translated.</summary>
        public const string SurveySchedulerRoleName = "Survey Scheduler";
        private readonly IOrganizationService _service;
        private readonly IAdministratorCheck _administrators;

        public SchedulerAccessCheck(IOrganizationService service, IAdministratorCheck administrators)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _administrators = administrators ?? throw new ArgumentNullException(nameof(administrators));
        }

        /// <inheritdoc />
        public bool MayRunDueSurveys(Guid userId) =>
            _administrators.IsSystemAdministrator(userId)
            || RoleMembership.Holds(_service, userId, new ConditionExpression("name", ConditionOperator.Equal, SurveySchedulerRoleName));
    }
}

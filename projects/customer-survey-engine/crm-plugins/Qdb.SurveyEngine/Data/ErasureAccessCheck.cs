using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Erasure;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Admits a caller of qdb_srv_EraseCustomerSurveyData who is a System Administrator or holds
    /// the Survey Data Officer role, directly or through a team. The role holds only
    /// Organisation Read — the platform minimum — and no survey or customer table rights; the
    /// erasure itself runs as SYSTEM (ADR-008, C.4).
    /// </summary>
    public sealed class ErasureAccessCheck : IErasureAccessCheck
    {
        /// <summary>The role created by provisioning (manifest.mjs ROLES) in every org; role names are not translated.</summary>
        public const string SurveyDataOfficerRoleName = "Survey Data Officer";

        private readonly IOrganizationService _service;
        private readonly IAdministratorCheck _administrators;

        public ErasureAccessCheck(IOrganizationService service, IAdministratorCheck administrators)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _administrators = administrators ?? throw new ArgumentNullException(nameof(administrators));
        }

        /// <inheritdoc />
        public bool MayErase(Guid userId) =>
            _administrators.IsSystemAdministrator(userId)
            || RoleMembership.Holds(_service, userId, new ConditionExpression("name", ConditionOperator.Equal, SurveyDataOfficerRoleName));
    }
}

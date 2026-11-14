using System;
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
        public bool IsSystemAdministrator(Guid userId) =>
            RoleMembership.Holds(_service, userId, new ConditionExpression("roletemplateid", ConditionOperator.Equal, SystemAdministratorTemplateId));
    }
}

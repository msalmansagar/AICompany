using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Plugins;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// Review item 3 (2026-11-19): the four integration APIs admit a System Administrator or the Survey Integration
    /// role, held directly or through a team, and then work as SYSTEM, so the portal account needs no table rights.
    /// </summary>
    public class IntegrationAccessCheckTests
    {
        private static Mock<IAdministratorCheck> Administrators(bool isAdministrator)
        {
            var administrators = new Mock<IAdministratorCheck>();
            administrators.Setup(a => a.IsSystemAdministrator(It.IsAny<Guid>())).Returns(isAdministrator);
            return administrators;
        }

        private static EntityCollection OneRole() => new EntityCollection(new[] { new Entity("role") });

        [Fact]
        public void MayCallIntegrationApis_SystemAdministrator_IsTrue()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);

            Assert.True(new IntegrationAccessCheck(service.Object, Administrators(true).Object).MayCallIntegrationApis(Guid.NewGuid()));
        }

        [Fact]
        public void MayCallIntegrationApis_DirectIntegrationRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(OneRole()).Returns(new EntityCollection());

            Assert.True(new IntegrationAccessCheck(service.Object, Administrators(false).Object).MayCallIntegrationApis(Guid.NewGuid()));
        }

        [Fact]
        public void MayCallIntegrationApis_IntegrationRoleThroughTeam_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection()).Returns(OneRole());

            Assert.True(new IntegrationAccessCheck(service.Object, Administrators(false).Object).MayCallIntegrationApis(Guid.NewGuid()));
        }

        [Fact]
        public void MayCallIntegrationApis_NeitherRole_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new IntegrationAccessCheck(service.Object, Administrators(false).Object).MayCallIntegrationApis(Guid.NewGuid()));
        }

        [Fact]
        public void MayCallIntegrationApis_LooksTheRoleUpByItsName()
        {
            var service = new Mock<IOrganizationService>();
            QueryExpression asked = null;
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = asked ?? (QueryExpression)q).Returns(new EntityCollection());

            new IntegrationAccessCheck(service.Object, Administrators(false).Object).MayCallIntegrationApis(Guid.NewGuid());

            var condition = asked.Criteria.Conditions.Single();
            Assert.Equal(("name", IntegrationAccessCheck.SurveyIntegrationRoleName), (condition.AttributeName, (string)condition.Values.Single()));
        }

        [Fact]
        public void SurveyIntegrationRoleName_IsTheProvisionedRoleName()
        {
            // Must match the role in provisioning/manifest.mjs (ROLES), which creates it in every org.
            Assert.Equal("Survey Integration", IntegrationAccessCheck.SurveyIntegrationRoleName);
        }

        [Fact]
        public void Constructor_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new IntegrationAccessCheck(null, Administrators(false).Object));
        }

        [Fact]
        public void Constructor_NullAdministratorCheck_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new IntegrationAccessCheck(new Mock<IOrganizationService>().Object, null));
        }
    }

    public class IntegrationPluginGateTests
    {
        private static IIntegrationAccessCheck Check(bool isAdmitted)
        {
            var check = new Mock<IIntegrationAccessCheck>();
            check.Setup(c => c.MayCallIntegrationApis(It.IsAny<Guid>())).Returns(isAdmitted);
            return check.Object;
        }

        [Fact]
        public void RequireAdmitted_CallerWithTheRole_Passes()
        {
            IntegrationPluginBase.RequireAdmitted(Check(true), Guid.NewGuid());
        }

        [Fact]
        public void RequireAdmitted_CallerWithoutTheRole_IsRefusedAsForbidden()
        {
            var refusal = Assert.Throws<SurveyApiException>(() => IntegrationPluginBase.RequireAdmitted(Check(false), Guid.NewGuid()));

            Assert.Equal(SurveyApiException.Forbidden, refusal.Code);
        }

        [Fact]
        public void RequireAdmitted_CallerWithoutTheRole_IsToldWhichRoleToGet()
        {
            var refusal = Assert.Throws<SurveyApiException>(() => IntegrationPluginBase.RequireAdmitted(Check(false), Guid.NewGuid()));

            Assert.Contains(IntegrationAccessCheck.SurveyIntegrationRoleName, refusal.Message);
        }
    }
}

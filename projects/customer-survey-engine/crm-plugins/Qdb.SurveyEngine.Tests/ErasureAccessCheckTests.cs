using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// ErasureAccessCheck admits a System Administrator or the Survey Data Officer role,
    /// held directly or through a team (FR-CSE-082, ADR-008 C.4).
    /// </summary>
    public class ErasureAccessCheckTests
    {
        private static Mock<IAdministratorCheck> Administrators(bool isAdministrator)
        {
            var administrators = new Mock<IAdministratorCheck>();
            administrators.Setup(a => a.IsSystemAdministrator(It.IsAny<Guid>())).Returns(isAdministrator);
            return administrators;
        }

        private static EntityCollection OneRole() => new EntityCollection(new[] { new Entity("role") });

        [Fact]
        public void MayErase_SystemAdministrator_IsTrue()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);

            Assert.True(new ErasureAccessCheck(service.Object, Administrators(true).Object).MayErase(Guid.NewGuid()));
        }

        [Fact]
        public void MayErase_DirectSurveyDataOfficerRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(OneRole()).Returns(new EntityCollection());

            Assert.True(new ErasureAccessCheck(service.Object, Administrators(false).Object).MayErase(Guid.NewGuid()));
        }

        [Fact]
        public void MayErase_SurveyDataOfficerRoleThroughTeam_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection()).Returns(OneRole());

            Assert.True(new ErasureAccessCheck(service.Object, Administrators(false).Object).MayErase(Guid.NewGuid()));
        }

        [Fact]
        public void MayErase_NeitherRole_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new ErasureAccessCheck(service.Object, Administrators(false).Object).MayErase(Guid.NewGuid()));
        }

        [Fact]
        public void MayErase_LooksTheRoleUpByItsName()
        {
            var service = new Mock<IOrganizationService>();
            QueryExpression asked = null;
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Callback<QueryBase>(q => asked = asked ?? (QueryExpression)q)
                   .Returns(new EntityCollection());

            new ErasureAccessCheck(service.Object, Administrators(false).Object).MayErase(Guid.NewGuid());

            var condition = asked.Criteria.Conditions.Single();
            Assert.Equal(("name", ErasureAccessCheck.SurveyDataOfficerRoleName), (condition.AttributeName, (string)condition.Values.Single()));
        }

        [Fact]
        public void SurveyDataOfficerRoleName_IsTheProvisionedRoleName()
        {
            // Must match the role in provisioning/manifest.mjs (ROLES), which creates it in every org.
            Assert.Equal("Survey Data Officer", ErasureAccessCheck.SurveyDataOfficerRoleName);
        }

        [Fact]
        public void Constructor_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ErasureAccessCheck(null, Administrators(false).Object));
        }

        [Fact]
        public void Constructor_NullAdministratorCheck_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ErasureAccessCheck(new Mock<IOrganizationService>().Object, null));
        }
    }
}

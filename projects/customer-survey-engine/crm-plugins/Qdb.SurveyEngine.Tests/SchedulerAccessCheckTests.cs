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
    /// CEO 2026-11-14 (audit SEC-01, checklist B8): qdb_srv_RunDueSurveys admits a System Administrator or
    /// the dedicated Survey Scheduler role, held directly or through a team.
    /// </summary>
    public class SchedulerAccessCheckTests
    {
        private static Mock<IAdministratorCheck> Administrators(bool isAdministrator)
        {
            var administrators = new Mock<IAdministratorCheck>();
            administrators.Setup(a => a.IsSystemAdministrator(It.IsAny<Guid>())).Returns(isAdministrator);
            return administrators;
        }

        private static EntityCollection OneRole() => new EntityCollection(new[] { new Entity("role") });

        [Fact]
        public void MayRunDueSurveys_SystemAdministrator_IsTrue()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);

            Assert.True(new SchedulerAccessCheck(service.Object, Administrators(true).Object).MayRunDueSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MayRunDueSurveys_DirectSchedulerRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(OneRole()).Returns(new EntityCollection());

            Assert.True(new SchedulerAccessCheck(service.Object, Administrators(false).Object).MayRunDueSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MayRunDueSurveys_SchedulerRoleThroughTeam_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection()).Returns(OneRole());

            Assert.True(new SchedulerAccessCheck(service.Object, Administrators(false).Object).MayRunDueSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MayRunDueSurveys_NeitherRole_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new SchedulerAccessCheck(service.Object, Administrators(false).Object).MayRunDueSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MayRunDueSurveys_LooksTheRoleUpByItsName()
        {
            var service = new Mock<IOrganizationService>();
            QueryExpression asked = null;
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = asked ?? (QueryExpression)q).Returns(new EntityCollection());

            new SchedulerAccessCheck(service.Object, Administrators(false).Object).MayRunDueSurveys(Guid.NewGuid());

            var condition = asked.Criteria.Conditions.Single();
            Assert.Equal(("name", SchedulerAccessCheck.SurveySchedulerRoleName), (condition.AttributeName, (string)condition.Values.Single()));
        }

        [Fact]
        public void SurveySchedulerRoleName_IsTheProvisionedRoleName()
        {
            // Must match the role in provisioning/manifest.mjs (ROLES), which creates it in every org.
            Assert.Equal("Survey Scheduler", SchedulerAccessCheck.SurveySchedulerRoleName);
        }

        [Fact]
        public void Constructor_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SchedulerAccessCheck(null, Administrators(false).Object));
        }

        [Fact]
        public void Constructor_NullAdministratorCheck_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SchedulerAccessCheck(new Mock<IOrganizationService>().Object, null));
        }
    }
}

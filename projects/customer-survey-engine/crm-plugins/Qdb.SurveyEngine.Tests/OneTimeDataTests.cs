using System;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Plugins;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class OneTimeTriggerStoreTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();

        private OneTimeTriggerStore Store() => new OneTimeTriggerStore(_service.Object);

        private static Entity TriggerRow(Guid id)
        {
            var row = new Entity("qdb_survey_trigger", id)
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.OneTime),
                ["qdb_is_active"] = true,
                ["qdb_audience"] = new OptionSetValue((int)AudienceKind.Filter),
                ["qdb_audience_fetchxml"] = "<fetch />",
                ["qdb_run_status"] = new OptionSetValue((int)OneTimeRunStatus.Sending),
                ["qdb_run_cursor"] = "3|<cookie />",
                ["qdb_invited_count"] = 7,
                ["createdon"] = new DateTime(2026, 11, 1),
                ["setup.qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", Guid.NewGuid()),
                ["setup.qdb_form_code"] = new AliasedValue("qdb_survey_setup", "qdb_form_code", "srv_x"),
                ["setup.qdb_is_active"] = new AliasedValue("qdb_survey_setup", "qdb_is_active", true),
            };
            row.RowVersion = "42";
            return row;
        }

        [Fact]
        public void Find_Row_MapsAudienceRunAndSetup()
        {
            var id = Guid.NewGuid();
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { TriggerRow(id) }));

            var trigger = Store().Find(id);

            Assert.Equal((AudienceKind.Filter, OneTimeRunStatus.Sending, 3, "<cookie />", 7, "42"),
                (trigger.Audience, trigger.Run.Status, trigger.Run.NextPage, trigger.Run.PagingCookie, trigger.Run.Counts.Invited, trigger.Run.RowVersion));
            Assert.True(trigger.IsSetupActive);
            Assert.Equal("srv_x", trigger.Trigger.Setup.FormCode);
        }

        [Fact]
        public void Find_NoRow_IsNull()
        {
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(Store().Find(Guid.NewGuid()));
        }

        [Fact]
        public void GetDueTriggerIds_AsksForActiveDueNotSentOrSendingOneTimeTriggers()
        {
            QueryExpression asked = null;
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q).Returns(new EntityCollection());

            Store().GetDueTriggerIds(new DateTime(2026, 12, 1, 10, 0, 0, DateTimeKind.Utc));

            var conditions = asked.Criteria.Conditions.Select(c => c.AttributeName).ToList();
            Assert.Equal(new[] { "qdb_trigger_kind", "qdb_is_active", "qdb_send_on", "qdb_run_status" }, conditions);
            Assert.Equal("qdb_is_active", asked.LinkEntities.Single().LinkCriteria.Conditions.Single().AttributeName);
        }

        [Fact]
        public void TryStart_RowChangedElsewhere_IsFalse()
        {
            _service.Setup(s => s.Execute(It.IsAny<UpdateRequest>()))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882) }));

            Assert.False(Store().TryStart(new OneTimeTrigger { Trigger = new SurveyTrigger { Id = Guid.NewGuid() } }, DateTime.UtcNow));
        }

        [Fact]
        public void TryStart_Succeeds_WritesSendingWithTheReadRowVersion()
        {
            UpdateRequest sent = null;
            _service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Callback<OrganizationRequest>(r => sent = (UpdateRequest)r).Returns(new UpdateResponse());

            var isStarted = Store().TryStart(new OneTimeTrigger { Trigger = new SurveyTrigger { Id = Guid.NewGuid() }, Run = new OneTimeRunState { RowVersion = "9" } }, DateTime.UtcNow);

            Assert.True(isStarted);
            Assert.Equal(("9", (int)OneTimeRunStatus.Sending), (sent.Target.RowVersion, sent.Target.GetAttributeValue<OptionSetValue>("qdb_run_status").Value));
        }

        [Fact]
        public void Fail_LongReason_IsCutToTheColumnLength()
        {
            Entity updated = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => updated = e);

            Store().Fail(Guid.NewGuid(), new string('x', 2500));

            Assert.Equal(2000, updated.GetAttributeValue<string>("qdb_run_message").Length);
        }

        [Fact]
        public void Complete_WritesSentOnAndTotals()
        {
            Entity updated = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => updated = e);
            var sentOn = new DateTime(2026, 12, 1, 10, 4, 0, DateTimeKind.Utc);

            Store().Complete(Guid.NewGuid(), new OneTimeRunState { Status = OneTimeRunStatus.Sent, SentOn = sentOn, Counts = new OneTimeCounts { Invited = 5, Suppressed = 2 } });

            Assert.Equal((sentOn, 5, 2), (updated.GetAttributeValue<DateTime?>("qdb_sent_on"), updated.GetAttributeValue<int>("qdb_invited_count"), updated.GetAttributeValue<int>("qdb_suppressed_count")));
        }

        [Fact]
        public void Cursor_FormatThenParse_RoundTrips()
        {
            var parsed = OneTimeTriggerStore.ParseCursor(OneTimeTriggerStore.FormatCursor(new OneTimeRunState { NextPage = 4, PagingCookie = "<cookie page=\"3\" />" }));

            Assert.Equal(Tuple.Create(4, "<cookie page=\"3\" />"), parsed);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("garbage")]
        [InlineData("0|x")]
        public void ParseCursor_EmptyOrUnreadable_StartsAtPageOne(string cursor)
        {
            Assert.Equal(Tuple.Create(1, (string)null), OneTimeTriggerStore.ParseCursor(cursor));
        }
    }

    public class DailyPassGateDataTests
    {
        private static Mock<IOrganizationService> ServiceWithSettings(DateTime? completedOn)
        {
            var service = new Mock<IOrganizationService>();
            var settings = new Entity("qdb_survey_settings", Guid.NewGuid()) { ["qdb_daily_passes_completed_on"] = completedOn };
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { settings }));
            return service;
        }

        [Fact]
        public void HasCompleted_SameDate_IsTrue()
        {
            Assert.True(new DailyPassGate(ServiceWithSettings(new DateTime(2026, 12, 1)).Object).HasCompleted(new DateTime(2026, 12, 1, 23, 0, 0)));
        }

        [Fact]
        public void HasCompleted_OtherDate_IsFalse()
        {
            Assert.False(new DailyPassGate(ServiceWithSettings(new DateTime(2026, 11, 30)).Object).HasCompleted(new DateTime(2026, 12, 1)));
        }

        [Fact]
        public void HasCompleted_NeverCompleted_IsFalse()
        {
            Assert.False(new DailyPassGate(ServiceWithSettings(null).Object).HasCompleted(new DateTime(2026, 12, 1)));
        }

        [Fact]
        public void MarkCompleted_WritesTheRunDate()
        {
            var service = ServiceWithSettings(null);
            Entity updated = null;
            service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => updated = e);

            new DailyPassGate(service.Object).MarkCompleted(new DateTime(2026, 12, 1, 10, 0, 0));

            Assert.Equal(new DateTime(2026, 12, 1), updated.GetAttributeValue<DateTime>("qdb_daily_passes_completed_on"));
        }

        [Fact]
        public void MarkCompleted_NoSettingsRow_WritesNothing()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            new DailyPassGate(service.Object).MarkCompleted(new DateTime(2026, 12, 1));

            service.Verify(s => s.Update(It.IsAny<Entity>()), Times.Never);
        }
    }

    public class AudienceReaderTests
    {
        [Fact]
        public void ReadPage_ReturnsIdsMoreRecordsAndCookie()
        {
            var service = new Mock<IOrganizationService>();
            var page = new EntityCollection(new[] { new Entity("account", Guid.NewGuid()) }) { MoreRecords = true, PagingCookie = "c1" };
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(page);

            var read = new AudienceReader(service.Object).ReadPage(AudienceQuery.AllActive("account"), 1, null);

            Assert.Equal((1, true, "c1"), (read.CustomerIds.Count, read.MoreRecords, read.PagingCookie));
        }

        [Fact]
        public void Count_SeveralPages_AddsThemUp()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(new EntityCollection(new[] { new Entity("account", Guid.NewGuid()), new Entity("account", Guid.NewGuid()) }) { MoreRecords = true, PagingCookie = "c" })
                .Returns(new EntityCollection(new[] { new Entity("account", Guid.NewGuid()) }));

            Assert.Equal(3, new AudienceReader(service.Object).Count(AudienceQuery.AllActive("account")));
        }
    }

    public class OneTimeAccessCheckTests
    {
        private static Mock<IAdministratorCheck> Administrators(bool isAdministrator)
        {
            var administrators = new Mock<IAdministratorCheck>();
            administrators.Setup(a => a.IsSystemAdministrator(It.IsAny<Guid>())).Returns(isAdministrator);
            return administrators;
        }

        [Fact]
        public void MaySendSurveys_SystemAdministrator_IsTrue()
        {
            Assert.True(new OneTimeAccessCheck(new Mock<IOrganizationService>(MockBehavior.Strict).Object, Administrators(true).Object).MaySendSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MaySendSurveys_SurveyAdminRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { new Entity("role") }));

            Assert.True(new OneTimeAccessCheck(service.Object, Administrators(false).Object).MaySendSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void MaySendSurveys_NoRole_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new OneTimeAccessCheck(service.Object, Administrators(false).Object).MaySendSurveys(Guid.NewGuid()));
        }

        [Fact]
        public void SurveyAdminRoleName_IsTheProvisionedRoleName()
        {
            // Must match the role in provisioning/manifest.mjs (ROLES).
            Assert.Equal("Survey Admin", OneTimeAccessCheck.SurveyAdminRoleName);
        }
    }

    public class TriggerAudienceValidationPluginTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();

        private void Execute(string message, Entity target, bool isCallerAdmin)
        {
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(isCallerAdmin ? new EntityCollection(new[] { new Entity("role") }) : new EntityCollection());
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.MessageName).Returns(message);
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection { ["Target"] = target });
            context.SetupGet(c => c.InitiatingUserId).Returns(Guid.NewGuid());
            var factory = new Mock<IOrganizationServiceFactory>();
            factory.Setup(f => f.CreateOrganizationService(It.IsAny<Guid?>())).Returns(_service.Object);
            var provider = new Mock<IServiceProvider>();
            provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(p => p.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
            new TriggerAudienceValidationPlugin().Execute(provider.Object);
        }

        private static Entity NewOneTime() => new Entity("qdb_survey_trigger") { ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.OneTime) };

        [Fact]
        public void Create_ByNonAdmin_IsRefused()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Execute("Create", NewOneTime(), isCallerAdmin: false));
        }

        [Fact]
        public void Create_ByAdmin_StartsTheRunRecordAtNotSent()
        {
            var target = NewOneTime();

            Execute("Create", target, isCallerAdmin: true);

            Assert.Equal((int)OneTimeRunStatus.NotSent, target.GetAttributeValue<OptionSetValue>("qdb_run_status").Value);
        }

        [Fact]
        public void Create_OtherKind_IsNotChecked()
        {
            var target = new Entity("qdb_survey_trigger") { ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Event) };

            Execute("Create", target, isCallerAdmin: false);

            Assert.False(target.Contains("qdb_run_status"));
        }

        [Fact]
        public void Update_RunRecordByScheduler_IsAllowed()
        {
            _service.Setup(s => s.Retrieve("qdb_survey_trigger", It.IsAny<Guid>(), It.IsAny<ColumnSet>())).Returns(NewOneTime());
            var target = new Entity("qdb_survey_trigger", Guid.NewGuid()) { ["qdb_invited_count"] = 100, ["qdb_run_cursor"] = "2|c" };

            Execute("Update", target, isCallerAdmin: false);
        }

        [Fact]
        public void Update_FilterOnAnotherTable_IsRefused()
        {
            _service.Setup(s => s.Retrieve("qdb_survey_trigger", It.IsAny<Guid>(), It.IsAny<ColumnSet>())).Returns(NewOneTime());
            var target = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_audience"] = new OptionSetValue((int)AudienceKind.Filter),
                ["qdb_audience_fetchxml"] = "<fetch><entity name='incident' /></fetch>",
            };

            Assert.Contains("'incident'", Assert.Throws<InvalidPluginExecutionException>(() => Execute("Update", target, isCallerAdmin: true)).Message);
        }
    }
}

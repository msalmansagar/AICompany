using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class FatiguePriorityMilestoneServiceTests
    {
        private const string Table = "qdb_payment_authorization_ticket";
        private const string Completed = "751090050";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");

        private readonly InMemorySurveyStore _store = new InMemorySurveyStore();
        private readonly SurveyTrigger _completionTrigger;
        private readonly SurveyTrigger _milestoneTrigger;

        public FatiguePriorityMilestoneServiceTests()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), Table, new SourceFields { CustomerLookup = "qdb_customer_name", CountsTowardMilestones = true });
            _completionTrigger = Trigger(TriggerKind.Event, "srv-completion", "00000000-0000-0000-0000-0000000000e1");
            _completionTrigger.StatusValues = CodeList.Parse(Completed);
            _milestoneTrigger = Trigger(TriggerKind.Milestone, "srv-milestone", "00000000-0000-0000-0000-0000000000a1");
            _milestoneTrigger.Milestone = new MilestoneSettings { EveryN = 5, StatusValues = CodeList.Parse(Completed), SkipReached = true };
            _milestoneTrigger.CreatedOn = _store.UtcNow.AddYears(-1);
            _store.CurrentRecord = new RecordChange { OldStatus = "1", NewStatus = Completed, CustomerId = CustomerId };
        }

        private SurveyTrigger Trigger(TriggerKind kind, string formCode, string id)
        {
            _store.PublishedVersions[formCode + "|en"] = 1;
            return new SurveyTrigger { Id = new Guid(id), Kind = kind, Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = formCode } };
        }

        private void QualifyingRecords(int count)
        {
            for (var i = 0; i < count; i++) _store.QualifyingRecordDates.Add(_store.UtcNow.AddDays(-i));
        }

        private void Handle() =>
            new SurveyTriggerService(_store.AsDependencies()).Handle(new RecordChange { Message = ChangeMessage.Update, TableLogicalName = Table, RecordId = Guid.NewGuid() });

        private void SentInvitationDaysAgo(int days) =>
            _store.Invitations.Add(new InvitationDraft { CustomerId = CustomerId, GeneratedOn = _store.UtcNow.AddDays(-days), Status = InvitationStatus.Pending, DedupeKey = "earlier" });

        [Fact]
        public void Handle_SurveyedTwentyDaysAgo_DropsTheEventTrigger()
        {
            _store.Triggers.Add(_completionTrigger);
            SentInvitationDaysAgo(20);

            Handle();

            Assert.Single(_store.Invitations);
            Assert.Equal(SuppressionReason.Fatigue, _store.Suppressions.Single().Reason);
        }

        [Fact]
        public void Handle_SurveyedThirtyOneDaysAgo_SendsAgain()
        {
            _store.Triggers.Add(_completionTrigger);
            SentInvitationDaysAgo(31);

            Handle();

            Assert.Equal(2, _store.Invitations.Count);
        }

        [Fact]
        public void Handle_FatigueOff_SendsDespiteARecentInvitation()
        {
            _store.Triggers.Add(_completionTrigger);
            _store.Settings = new SurveySettings { FatigueMinDays = 0 };
            SentInvitationDaysAgo(1);

            Handle();

            Assert.Equal(2, _store.Invitations.Count);
        }

        [Fact]
        public void Handle_FatiguedMilestone_IsPostponedNotLost()
        {
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(5);
            SentInvitationDaysAgo(10);

            Handle();

            Assert.Equal(InvitationStatus.Postponed, _store.Invitations.Last().Status);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_FifthCompletion_MilestoneWinsAndTheCompletionTriggerIsDropped()
        {
            _store.Triggers.Add(_completionTrigger);
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(5);

            Handle();

            var invitation = _store.Invitations.Single();
            Assert.Equal("srv-milestone", invitation.FormCode);
            Assert.Equal(1, invitation.MilestoneIndex);
            Assert.Equal(SuppressionReason.PriorityLost, _store.Suppressions.Single().Reason);
        }

        [Fact]
        public void Handle_LoserSetToPostpone_IsQueuedInsteadOfDropped()
        {
            _completionTrigger.FatigueAction = FatigueAction.Postpone;
            _store.Triggers.Add(_completionTrigger);
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(5);

            Handle();

            Assert.Equal(InvitationStatus.Postponed, _store.Invitations.Single(i => i.FormCode == "srv-completion").Status);
        }

        [Fact]
        public void Handle_FourthCompletion_MilestoneSendsNothingAndLogsNothing()
        {
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(4);

            Handle();

            Assert.Empty(_store.Invitations);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_MilestoneReEvaluatedAtTheSameCount_FiresIndexOnlyOnce()
        {
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(5);

            Handle();
            Handle();

            Assert.Single(_store.Invitations);
        }

        [Fact]
        public void Handle_SevenQualifyingBeforeActivation_SkipsUntilTheTenth()
        {
            _store.Triggers.Add(_milestoneTrigger);
            _milestoneTrigger.CreatedOn = _store.UtcNow.AddDays(-1);
            for (var i = 0; i < 7; i++) _store.QualifyingRecordDates.Add(_store.UtcNow.AddDays(-30));
            _store.QualifyingRecordDates.Add(_store.UtcNow);

            Handle();

            Assert.Empty(_store.Invitations);
        }

        [Fact]
        public void Handle_SourceDoesNotCount_MilestoneNeverFires()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), Table, new SourceFields { CustomerLookup = "qdb_cif_no", CountsTowardMilestones = false });
            _store.Triggers.Add(_milestoneTrigger);
            QualifyingRecords(5);

            Handle();

            Assert.Empty(_store.Invitations);
        }
    }

    public class MilestoneCounterTests
    {
        private static MilestoneCountQuery Query(DateTime? createdBefore = null) => new MilestoneCountQuery
        {
            Source = new SurveySource(Guid.NewGuid(), "qdb_payment_authorization_ticket", new SourceFields { CustomerLookup = "qdb_customer_name", Type = "qdb_disbursement_type_1", Status = "statuscode" }),
            Settings = new MilestoneSettings { StatusValues = CodeList.Parse("751090050"), TypeValues = CodeList.Parse("751090000,100000000"), CountFrom = new DateTime(2026, 1, 1) },
            CustomerId = new Guid("22222222-2222-2222-2222-222222222222"),
            CreatedBefore = createdBefore,
        };

        [Fact]
        public void BuildFetchXml_Query_FiltersCustomerStatusTypeAndStartDate()
        {
            var fetch = MilestoneCounter.BuildFetchXml(Query());

            Assert.Contains("attribute='qdb_customer_name' operator='eq' value='22222222-2222-2222-2222-222222222222'", fetch);
            Assert.Contains("attribute='statuscode' operator='in'><value>751090050</value>", fetch);
            Assert.Contains("<value>100000000</value><value>751090000</value>", fetch);
            Assert.Contains("attribute='createdon' operator='on-or-after' value='2026-01-01'", fetch);
        }

        [Fact]
        public void BuildFetchXml_CreatedBefore_AddsTheUpperLimit()
        {
            var fetch = MilestoneCounter.BuildFetchXml(Query(new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc)));

            Assert.Contains("attribute='createdon' operator='lt' value='2026-06-01T00:00:00.0000000Z'", fetch);
        }

        [Fact]
        public void CountQualifying_NoCountedStatuses_IsZeroWithoutQuerying()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            var query = Query();
            query.Settings.StatusValues = CodeList.Empty;

            Assert.Equal(0, new MilestoneCounter(service.Object).CountQualifying(query));
        }
    }
}

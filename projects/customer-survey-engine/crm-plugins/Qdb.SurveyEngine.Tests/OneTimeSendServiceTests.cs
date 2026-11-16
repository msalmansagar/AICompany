using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class OneTimeSendServiceTests
    {
        private const string FormCode = "srv_general";
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _scheduling;
        private readonly OneTimeTrigger _trigger;

        public OneTimeSendServiceTests()
        {
            _scheduling = new InMemorySchedulingStore(_pipeline);
            _pipeline.PublishedVersions[FormCode + "|en"] = 3;
            _trigger = new OneTimeTrigger
            {
                Trigger = new SurveyTrigger { Id = Guid.NewGuid(), Kind = TriggerKind.OneTime, Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = FormCode, ExpiryDays = 14 } },
                IsTriggerActive = true, IsSetupActive = true, Audience = AudienceKind.AllActiveCustomers,
            };
            Store.Triggers[_trigger.Trigger.Id] = _trigger;
        }

        private InMemoryOneTimeStore Store => _scheduling.OneTime;

        private OneTimeSendService Service()
        {
            var deps = _scheduling.AsDependencies();
            return new OneTimeSendService(new OneTimeSendDependencies
            {
                Pipeline = deps.Pipeline, Triggers = Store, Audience = Store, GeneratedKeys = _scheduling, CustomerTable = "account",
            });
        }

        private OneTimeSendResult Send(TimeSpan? allowance = null) =>
            Service().Send(_trigger.Trigger.Id, new RunBudget(_pipeline, allowance ?? TimeSpan.FromMinutes(5)));

        private void GiveAudience(int customers) => Store.AudienceCustomers.AddRange(Enumerable.Range(0, customers).Select(_ => Guid.NewGuid()));

        [Fact]
        public void Send_AllActiveAudience_InvitesEveryCustomerAndMarksSent()
        {
            GiveAudience(3);

            var result = Send();

            Assert.Equal((OneTimeRunStatus.Sent, 3, true), (result.Status, result.Counts.Invited, result.IsComplete));
            Assert.Equal(OneTimeRunStatus.Sent, _trigger.Run.Status);
        }

        [Fact]
        public void Send_Invitation_UsesDigitalDeliveryOneTimeKeyAndExpiryFromCreation()
        {
            GiveAudience(1);

            Send();

            var invitation = Assert.Single(_pipeline.Invitations);
            Assert.Equal(DedupeKey.ForOneTime(_trigger.Trigger.Setup.Id, Store.AudienceCustomers[0], _trigger.Trigger.Id), invitation.DedupeKey);
            Assert.Equal(DedupeKey.OneTimePeriodKey(_trigger.Trigger.Id), invitation.SchedulePeriodKey);
            Assert.Equal(_pipeline.UtcNow.AddDays(14), invitation.ExpiresOn);
            Assert.Null(invitation.SourceTable);
        }

        [Fact]
        public void Send_RecentlySurveyedCustomer_IsPostponedByDefault()
        {
            GiveAudience(1);
            _pipeline.Invitations.Add(new InvitationDraft { CustomerId = Store.AudienceCustomers[0], GeneratedOn = _pipeline.UtcNow.AddDays(-5), Status = InvitationStatus.Pending, DedupeKey = "earlier" });

            var result = Send();

            Assert.Equal((0, 1), (result.Counts.Invited, result.Counts.Postponed));
        }

        [Fact]
        public void Send_RecentlySurveyedCustomerWithDrop_IsLoggedAsSuppressed()
        {
            GiveAudience(1);
            _trigger.Trigger.FatigueAction = FatigueAction.Drop;
            _pipeline.Invitations.Add(new InvitationDraft { CustomerId = Store.AudienceCustomers[0], GeneratedOn = _pipeline.UtcNow.AddDays(-5), Status = InvitationStatus.Pending, DedupeKey = "earlier" });

            var result = Send();

            Assert.Equal(1, result.Counts.Suppressed);
            Assert.Equal(SuppressionReason.Fatigue, Assert.Single(_pipeline.Suppressions).Reason);
        }

        [Fact]
        public void Send_FormNotPublished_CountsTheCustomerAsSuppressed()
        {
            GiveAudience(2);
            _pipeline.PublishedVersions.Clear();

            Assert.Equal(2, Send().Counts.Suppressed);
        }

        [Fact]
        public void Send_BudgetRunsOutBetweenPages_StopsAndSavesTheCursor()
        {
            GiveAudience(OneTimeSendService.PageSize * 3);
            Store.ClockStepPerPage = TimeSpan.FromSeconds(30);

            var result = Send(TimeSpan.FromSeconds(50));

            Assert.False(result.IsComplete);
            Assert.Equal((OneTimeRunStatus.Sending, 3, "cookie-2"), (_trigger.Run.Status, _trigger.Run.NextPage, _trigger.Run.PagingCookie));
        }

        [Fact]
        public void Send_CalledAgainAfterBudget_FinishesWithoutDuplicates()
        {
            GiveAudience(OneTimeSendService.PageSize * 3);
            Store.ClockStepPerPage = TimeSpan.FromSeconds(30);
            Send(TimeSpan.FromSeconds(50));

            var result = Send(TimeSpan.FromMinutes(5));

            Assert.Equal((OneTimeRunStatus.Sent, OneTimeSendService.PageSize * 3), (result.Status, result.Counts.Invited));
            Assert.Equal(_pipeline.Invitations.Count, _pipeline.Invitations.Select(i => i.DedupeKey).Distinct().Count());
        }

        [Fact]
        public void Send_ResumedPage_SkipsCustomersTheTriggerAlreadyInvited()
        {
            GiveAudience(2);
            var already = DedupeKey.ForOneTime(_trigger.Trigger.Setup.Id, Store.AudienceCustomers[0], _trigger.Trigger.Id);
            _pipeline.Invitations.Add(new InvitationDraft { SetupId = _trigger.Trigger.Setup.Id, CustomerId = Guid.NewGuid(), DedupeKey = already, SchedulePeriodKey = DedupeKey.OneTimePeriodKey(_trigger.Trigger.Id), Status = InvitationStatus.Postponed, GeneratedOn = _pipeline.UtcNow });
            _trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Sending };

            var result = Send();

            Assert.Equal((1, 0), (result.Counts.Invited, result.Counts.Suppressed));
        }

        [Fact]
        public void Send_AlreadySent_IsRefused()
        {
            _trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Sent, SentOn = _pipeline.UtcNow };

            Assert.Contains("already sent", Assert.Throws<OneTimeSendRefusedException>(() => Send()).Message);
        }

        [Fact]
        public void Send_TriggerSwitchedOff_IsRefused()
        {
            _trigger.IsTriggerActive = false;

            Assert.Contains("Is Active", Assert.Throws<OneTimeSendRefusedException>(() => Send()).Message);
        }

        [Fact]
        public void Send_SetupSwitchedOff_IsRefused()
        {
            _trigger.IsSetupActive = false;

            Assert.Contains("setup", Assert.Throws<OneTimeSendRefusedException>(() => Send()).Message);
        }

        [Fact]
        public void Send_UnusableFilter_FailsWithTheReasonAndSendsNothing()
        {
            GiveAudience(2);
            _trigger.Audience = AudienceKind.Filter;
            _trigger.AudienceFetchXml = "<fetch><entity name='incident' /></fetch>";

            var result = Send();

            Assert.Equal(OneTimeRunStatus.Failed, result.Status);
            Assert.Contains("'incident'", Store.FailReason);
            Assert.Empty(_pipeline.Invitations);
        }

        [Fact]
        public void Send_FailedBeforeReachingAnyone_StartsAgainOnceFixed()
        {
            GiveAudience(2);
            _trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Failed };

            Assert.Equal(2, Send().Counts.Invited);
        }

        [Fact]
        public void Send_FailedAfterReachingSome_IsRefused()
        {
            _trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Failed, Counts = new OneTimeCounts { Invited = 4 } };

            Assert.Throws<OneTimeSendRefusedException>(() => Send());
        }

        [Fact]
        public void Send_DigitalDeliveryNone_Fails()
        {
            _trigger.Trigger.Setup.DeliveryDigital = DeliveryChoice.None;

            Assert.Equal(OneTimeRunStatus.Failed, Send().Status);
        }

        [Fact]
        public void Send_OutsideActiveWindow_Fails()
        {
            _trigger.Trigger.Setup.ActiveTo = _pipeline.UtcNow.AddDays(-1);

            Assert.Contains("active window", Send().Message);
        }

        [Fact]
        public void Send_AnotherSendStartedFirst_IsRefused()
        {
            Store.IsStartRaceLost = true;

            Assert.Throws<OneTimeSendRefusedException>(() => Send());
        }

        [Fact]
        public void Send_UnknownTrigger_IsRefused()
        {
            Assert.Throws<OneTimeSendRefusedException>(() => Service().Send(Guid.NewGuid(), new RunBudget(_pipeline, TimeSpan.FromMinutes(1))));
        }

        [Fact]
        public void Preview_ReturnsTheAudienceCount()
        {
            GiveAudience(37);

            Assert.Equal(37, Service().Preview(_trigger.Trigger.Id));
        }

        [Fact]
        public void Preview_UnusableFilter_IsRefusedWithTheReason()
        {
            _trigger.Audience = AudienceKind.Filter;
            _trigger.AudienceFetchXml = string.Empty;

            Assert.Contains("empty", Assert.Throws<OneTimeSendRefusedException>(() => Service().Preview(_trigger.Trigger.Id)).Message);
        }

        [Fact]
        public void Constructor_MissingCustomerTable_Throws()
        {
            var deps = _scheduling.AsDependencies();

            Assert.Throws<ArgumentException>(() => new OneTimeSendService(new OneTimeSendDependencies { Pipeline = deps.Pipeline, Triggers = Store, Audience = Store, GeneratedKeys = _scheduling }));
        }
    }

    public class OneTimeDuePassTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _scheduling;

        public OneTimeDuePassTests()
        {
            _scheduling = new InMemorySchedulingStore(_pipeline);
            _pipeline.PublishedVersions["srv_x|en"] = 1;
            _scheduling.OneTime.AudienceCustomers.Add(Guid.NewGuid());
        }

        private OneTimeTrigger AddTrigger(DateTime? sendOn, bool isActive = true)
        {
            var trigger = new OneTimeTrigger
            {
                Trigger = new SurveyTrigger { Id = Guid.NewGuid(), Kind = TriggerKind.OneTime, Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = "srv_x" } },
                IsTriggerActive = isActive, IsSetupActive = true, SendOn = sendOn,
            };
            _scheduling.OneTime.Triggers[trigger.Trigger.Id] = trigger;
            return trigger;
        }

        private OneTimeDueResult Run() => RunDueSurveysService.Compose(_scheduling.AsDependencies()).Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(5))).OneTime;

        [Fact]
        public void Run_TriggerWhoseTimeHasCome_IsSent()
        {
            var due = AddTrigger(_pipeline.UtcNow.AddMinutes(-1));

            Run();

            Assert.Equal(OneTimeRunStatus.Sent, due.Run.Status);
        }

        [Fact]
        public void Run_TriggerInTheFuture_IsNotSent()
        {
            var later = AddTrigger(_pipeline.UtcNow.AddMinutes(1));

            Run();

            Assert.Equal(OneTimeRunStatus.NotSent, later.Run.Status);
        }

        [Fact]
        public void Run_TwoDueTriggers_ReportsBoth()
        {
            AddTrigger(_pipeline.UtcNow.AddHours(-1));
            AddTrigger(_pipeline.UtcNow.AddMinutes(-1));

            var result = Run();

            Assert.Equal((2, 2), (result.Triggers, result.Sent));
        }

        [Fact]
        public void Run_FailingTrigger_DoesNotStopTheOthers()
        {
            var broken = AddTrigger(_pipeline.UtcNow.AddHours(-1));
            broken.Audience = AudienceKind.Filter;
            broken.AudienceFetchXml = "<fetch><entity";
            var good = AddTrigger(_pipeline.UtcNow.AddMinutes(-1));

            var result = Run();

            Assert.Equal(OneTimeRunStatus.Sent, good.Run.Status);
            Assert.Single(result.Problems);
        }
    }

    public class DailyPassGateTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _scheduling;

        public DailyPassGateTests()
        {
            _scheduling = new InMemorySchedulingStore(_pipeline);
        }

        private RunSummary Run() => RunDueSurveysService.Compose(_scheduling.AsDependencies()).Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(5)));

        [Fact]
        public void Run_FirstCallOfTheDay_RunsTheDailyPassesAndRemembersTheDate()
        {
            var summary = Run();

            Assert.True(summary.RanDailyPasses);
            Assert.Equal(_pipeline.UtcNow.Date, _scheduling.OneTime.DailyPassesCompletedOn);
        }

        [Fact]
        public void Run_LaterCallSameDay_SkipsTheDailyPasses()
        {
            Run();

            var summary = Run();

            Assert.False(summary.RanDailyPasses);
            Assert.Contains("already completed", summary.ToString());
        }

        [Fact]
        public void Run_DailyPassesCutByBudget_DateIsNotRemembered()
        {
            _scheduling.Postponed.Add(new PostponedInvitation { Id = Guid.NewGuid(), Setup = new SurveySetup(), IsSetupActive = true });

            RunDueSurveysService.Compose(_scheduling.AsDependencies()).Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.Zero));

            Assert.Null(_scheduling.OneTime.DailyPassesCompletedOn);
        }

        [Fact]
        public void Run_EarlierRunDate_RunsTheDailyPassesAgain()
        {
            Run();

            var summary = RunDueSurveysService.Compose(_scheduling.AsDependencies()).Run(_pipeline.UtcNow.AddDays(-1), new RunBudget(_pipeline, TimeSpan.FromMinutes(5)));

            Assert.True(summary.RanDailyPasses);
        }
    }

    public class OneTimeTriggerRulesTests
    {
        private static OneTimeTriggerSave Save(params string[] columns) => new OneTimeTriggerSave
        {
            ChangedColumns = new System.Collections.Generic.HashSet<string>(columns), IsCallerSurveyAdmin = true,
        };

        [Fact]
        public void FindProblem_RunRecordOnlyByNonAdmin_IsAllowed()
        {
            var save = Save("qdb_run_status", "qdb_run_cursor", "qdb_invited_count");
            save.IsCallerSurveyAdmin = false;

            Assert.Null(OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_DefinitionByNonAdmin_IsRefused()
        {
            var save = Save("qdb_send_on");
            save.IsCallerSurveyAdmin = false;

            Assert.Contains("Survey Admin", OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_CreateByNonAdmin_IsRefused()
        {
            var save = Save();
            save.IsCreate = true;
            save.IsCallerSurveyAdmin = false;

            Assert.NotNull(OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_FilterOnAnotherTable_IsRefused()
        {
            var save = Save("qdb_audience_fetchxml");
            save.Audience = AudienceKind.Filter;
            save.AudienceFetchXml = "<fetch><entity name='contact' /></fetch>";

            Assert.Contains("'contact'", OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_InactiveDraftWithEmptyFilter_IsAllowed()
        {
            var save = Save("qdb_audience");
            save.Audience = AudienceKind.Filter;

            Assert.Null(OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_ActivatingWithEmptyFilter_IsRefused()
        {
            var save = Save("qdb_is_active");
            save.Audience = AudienceKind.Filter;
            save.IsActive = true;

            Assert.Contains("empty", OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_AudienceChangeDuringSend_IsRefused()
        {
            var save = Save("qdb_audience_fetchxml");
            save.Status = OneTimeRunStatus.Sending;

            Assert.Contains("being sent", OneTimeTriggerRules.FindProblem(save, "account"));
        }

        [Fact]
        public void FindProblem_ValidFilter_IsAllowed()
        {
            var save = Save("qdb_audience_fetchxml");
            save.Audience = AudienceKind.Filter;
            save.AudienceFetchXml = "<fetch><entity name='account'><filter><condition attribute='name' operator='like' value='A%' /></filter></entity></fetch>";

            Assert.Null(OneTimeTriggerRules.FindProblem(save, "account"));
        }
    }
}

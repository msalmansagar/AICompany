using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class ScheduleCalendarTests
    {
        [Theory]
        [InlineData(SchedulePeriod.Monthly, "2026-03-01", true)]
        [InlineData(SchedulePeriod.Monthly, "2026-03-02", false)]
        [InlineData(SchedulePeriod.Quarterly, "2026-04-01", true)]
        [InlineData(SchedulePeriod.Quarterly, "2026-05-01", false)]
        [InlineData(SchedulePeriod.Annually, "2026-01-01", true)]
        [InlineData(SchedulePeriod.Annually, "2026-07-01", false)]
        public void IsDue_CalendarDate_FollowsThePeriod(SchedulePeriod period, string date, bool expected)
        {
            Assert.Equal(expected, ScheduleCalendar.IsDue(period, DateTime.Parse(date)));
        }

        [Theory]
        [InlineData(SchedulePeriod.Monthly, "2026-04-01", "2026-03", "2026-03-01")]
        [InlineData(SchedulePeriod.Quarterly, "2026-04-01", "2026-Q1", "2026-01-01")]
        [InlineData(SchedulePeriod.Quarterly, "2027-01-01", "2026-Q4", "2026-10-01")]
        [InlineData(SchedulePeriod.Annually, "2026-01-01", "2025", "2025-01-01")]
        public void PeriodEndingOn_RunDate_SurveysThePeriodJustEnded(SchedulePeriod period, string runDate, string key, string start)
        {
            var reviewed = ScheduleCalendar.PeriodEndingOn(period, DateTime.Parse(runDate));

            Assert.Equal(key, reviewed.Key);
            Assert.Equal(DateTime.Parse(start), reviewed.Start);
            Assert.Equal(DateTime.Parse(runDate), reviewed.EndExclusive);
        }

        [Fact]
        public void FixedExpiry_QuarterlyQ1_ClosesOnFirstOfMay()
        {
            var q1 = ScheduleCalendar.PeriodEndingOn(SchedulePeriod.Quarterly, new DateTime(2026, 4, 1));

            Assert.Equal(new DateTime(2026, 5, 1), ScheduleCalendar.FixedExpiry(SchedulePeriod.Quarterly, q1));
        }

        [Fact]
        public void FixedExpiry_Monthly_IsNullSoTheSetupExpiryApplies()
        {
            var march = ScheduleCalendar.PeriodEndingOn(SchedulePeriod.Monthly, new DateTime(2026, 4, 1));

            Assert.Null(ScheduleCalendar.FixedExpiry(SchedulePeriod.Monthly, march));
        }

        [Fact]
        public void ForSchedule_Key_IsSetupCustomerAndPeriod()
        {
            var key = DedupeKey.ForSchedule(new Guid("11111111-1111-1111-1111-111111111111"), new Guid("22222222-2222-2222-2222-222222222222"), "2026-Q1");

            Assert.Equal("11111111-1111-1111-1111-111111111111|22222222-2222-2222-2222-222222222222|2026-Q1", key);
        }
    }

    public class ScheduledTriggerPassTests
    {
        private static readonly DateTime NewYear = new DateTime(2027, 1, 1);
        private static readonly Guid CustomerA = new Guid("aaaaaaaa-0000-0000-0000-000000000001");
        private static readonly Guid CustomerB = new Guid("bbbbbbbb-0000-0000-0000-000000000002");
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore { UtcNow = new DateTime(2027, 1, 1, 6, 0, 0, DateTimeKind.Utc) };
        private readonly InMemorySchedulingStore _store;

        public ScheduledTriggerPassTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
            _store.ActiveCustomers.AddRange(new[] { CustomerA, CustomerB });
        }

        private SurveyTrigger Scheduled(SchedulePeriod period, string formCode, string id = "00000000-0000-0000-0000-0000000000c1")
        {
            _pipeline.PublishedVersions[formCode + "|en"] = 3;
            var trigger = new SurveyTrigger
            {
                Id = new Guid(id), Kind = TriggerKind.Scheduled,
                Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = formCode, ExpiryDays = 14 },
                Schedule = new ScheduleSettings { Period = period, Population = SchedulePopulation.AllActiveCustomers },
            };
            _store.ScheduledTriggers.Add(trigger);
            return trigger;
        }

        private RunSummary Run(DateTime runDate, TimeSpan? allowance = null) =>
            RunDueSurveysService.Compose(_store.AsDependencies()).Run(runDate, new RunBudget(_pipeline, allowance ?? TimeSpan.FromMinutes(1)));

        [Fact]
        public void Run_QuarterlyDue_InvitesEveryActiveCustomerForThePeriod()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");

            Run(NewYear);

            Assert.Equal(new[] { CustomerA, CustomerB }, _pipeline.Invitations.Select(i => i.CustomerId).OrderBy(id => id));
            Assert.All(_pipeline.Invitations, i => Assert.Equal("2026-Q4", i.SchedulePeriodKey));
        }

        [Fact]
        public void Run_QuarterlyDue_ExpiresOneMonthIntoTheNextQuarter()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");

            Run(NewYear);

            Assert.All(_pipeline.Invitations, i => Assert.Equal(new DateTime(2027, 2, 1), i.ExpiresOn));
        }

        [Fact]
        public void Run_MonthlyDue_UsesTheSetupExpiryDaysAndHasNoSourceRecord()
        {
            Scheduled(SchedulePeriod.Monthly, "srv-monthly");

            Run(NewYear);

            var invitation = _pipeline.Invitations.First();
            Assert.Equal(_pipeline.UtcNow.AddDays(14), invitation.ExpiresOn);
            Assert.Null(invitation.SourceRecordId);
        }

        [Fact]
        // ADR-011: the run record now says the period was sent, so a re-run reports it instead of re-reading everyone.
        public void Run_TwiceOnTheSameDay_CreatesNoDuplicates()
        {
            Scheduled(SchedulePeriod.Annually, "srv-annual");
            Run(NewYear);
            // The daily gate would skip the second run (ADR-010); clear it to prove the pass itself is idempotent.
            _store.OneTime.DailyPassesCompletedOn = null;

            var second = Run(NewYear);

            Assert.Equal(2, _pipeline.Invitations.Count);
            Assert.Equal(1, second.Scheduled.AlreadySent);
        }

        // DEF-CSE-003: the scheduler did not run on 1 January; the run on the 2nd must still send December's survey.
        [Fact]
        public void Run_FirstOfTheMonthMissed_NextDaySendsThatMonthsSurvey()
        {
            Scheduled(SchedulePeriod.Monthly, "srv-monthly");
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-1);

            Run(NewYear.AddDays(1));

            Assert.All(_pipeline.Invitations, i => Assert.Equal("2026-12", i.SchedulePeriodKey));
            Assert.Equal(2, _pipeline.Invitations.Count);
        }

        [Fact]
        public void Run_FirstOfTheMonthMissed_SummaryNamesTheDayCaughtUp()
        {
            Scheduled(SchedulePeriod.Monthly, "srv-monthly");
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-1);

            Assert.Contains("Missed day 2027-01-01", Run(NewYear.AddDays(1)).ToString());
        }

        [Fact]
        public void Run_FirstOfTheMonthMissed_RemembersTheRunDate()
        {
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-1);

            Run(NewYear.AddDays(1));

            Assert.Equal(NewYear.AddDays(1), _store.OneTime.DailyPassesCompletedOn);
        }

        [Fact]
        public void Run_EarlierRunDateReRun_DoesNotMoveTheCompletedDateBack()
        {
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(5);

            Run(NewYear);

            Assert.Equal(NewYear.AddDays(5), _store.OneTime.DailyPassesCompletedOn);
        }

        // 31 Dec has nothing due, so it finishes even with no budget; 1 Jan's monthly survey is cut, so the next
        // call resumes at 1 Jan.
        [Fact]
        public void Run_MissedDaysCutByBudget_RemembersOnlyTheDaysThatFinished()
        {
            Scheduled(SchedulePeriod.Monthly, "srv-monthly");
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-2);

            Run(NewYear.AddDays(1), TimeSpan.Zero);

            Assert.Equal(NewYear.AddDays(-1), _store.OneTime.DailyPassesCompletedOn);
        }

        [Fact]
        public void Run_MissedDaysCutByBudget_NextCallSendsTheCutDay()
        {
            Scheduled(SchedulePeriod.Monthly, "srv-monthly");
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-2);
            Run(NewYear.AddDays(1), TimeSpan.Zero);

            Run(NewYear.AddDays(1));

            Assert.Equal(2, _pipeline.Invitations.Count(i => i.SchedulePeriodKey == "2026-12"));
        }

        [Fact]
        public void Run_NotTheFirstOfThePeriod_CreatesNothing()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");

            var summary = Run(new DateTime(2027, 2, 1));

            Assert.Equal(0, summary.Scheduled.DueTriggers);
            Assert.Empty(_pipeline.Invitations);
        }

        [Fact]
        public void Run_ActiveInPeriod_QueriesTheReviewedPeriodWithTheTriggerFilters()
        {
            var trigger = Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");
            trigger.Schedule.Population = SchedulePopulation.ActiveInPeriod;
            trigger.Schedule.PopulationSource = new SurveySource(Guid.NewGuid(), "qdb_payment_authorization_ticket", new SourceFields { CustomerLookup = "qdb_customer_name" });
            trigger.StatusValues = CodeList.Parse("751090050");
            _store.CustomersActiveInPeriod.Add(CustomerB);

            Run(NewYear);

            Assert.Equal(new DateTime(2026, 10, 1), _store.LastPopulationQuery.Period.Start);
            Assert.True(_store.LastPopulationQuery.StatusValues.Contains("751090050"));
            Assert.Equal(CustomerB, _pipeline.Invitations.Single().CustomerId);
        }

        [Fact]
        public void Run_ActiveInPeriodWithoutASource_ReportsTheProblemAndSendsNothing()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly").Schedule.Population = SchedulePopulation.ActiveInPeriod;

            var summary = Run(NewYear);

            Assert.Contains("no population source", Assert.Single(summary.Scheduled.Problems));
            Assert.Empty(_pipeline.Invitations);
        }

        [Fact]
        public void Run_CustomerSurveyedRecently_PostponesByDefault()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");
            _pipeline.Invitations.Add(new InvitationDraft { CustomerId = CustomerA, GeneratedOn = _pipeline.UtcNow.AddDays(-5), Status = InvitationStatus.Pending, DedupeKey = "earlier" });

            Run(NewYear);

            Assert.Equal(InvitationStatus.Postponed, _pipeline.Invitations.Single(i => i.CustomerId == CustomerA && i.SchedulePeriodKey != null).Status);
        }

        [Fact]
        public void Run_TwoSchedulesDueForOneCustomer_SendsTheHigherPriorityAndPostponesTheOther()
        {
            Scheduled(SchedulePeriod.Annually, "srv-annual", "00000000-0000-0000-0000-0000000000a1").Priority = 1;
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly", "00000000-0000-0000-0000-0000000000a2").Priority = 2;
            _store.ActiveCustomers.Remove(CustomerB);

            Run(NewYear);

            Assert.Equal(InvitationStatus.Pending, _pipeline.Invitations.Single(i => i.FormCode == "srv-annual").Status);
            Assert.Equal(InvitationStatus.Postponed, _pipeline.Invitations.Single(i => i.FormCode == "srv-quarterly").Status);
        }

        [Fact]
        public void Run_SetupOutsideItsWindow_LogsOnceWithoutACustomer()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly").Setup.ActiveTo = new DateTime(2026, 12, 31);

            Run(NewYear);

            var entry = Assert.Single(_pipeline.Suppressions);
            Assert.Equal(SuppressionReason.OutsideWindow, entry.Reason);
            Assert.Null(entry.CustomerId);
        }

        [Fact]
        public void Run_DigitalDeliveryNone_LogsChannelNone()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly").Setup.DeliveryDigital = DeliveryChoice.None;

            Run(NewYear);

            Assert.Equal(SuppressionReason.ChannelNone, Assert.Single(_pipeline.Suppressions).Reason);
        }

        [Fact]
        public void Run_FormNotPublished_LogsPerCustomer()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");
            _pipeline.PublishedVersions.Clear();

            Run(NewYear);

            Assert.Equal(2, _pipeline.Suppressions.Count(s => s.Reason == SuppressionReason.FormNotPublished));
        }

        [Fact]
        public void Run_BudgetSpent_SaysToCallAgain()
        {
            Scheduled(SchedulePeriod.Quarterly, "srv-quarterly");

            var summary = Run(NewYear, TimeSpan.Zero);

            Assert.False(summary.IsComplete);
            Assert.Empty(_pipeline.Invitations);
        }
    }

    public class PostponedReleasePassTests
    {
        private static readonly Guid Customer = new Guid("cccccccc-0000-0000-0000-000000000003");
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _store;

        public PostponedReleasePassTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
        }

        private PostponedInvitation Postponed(int expiresInDays = 10)
        {
            var invitation = new PostponedInvitation
            {
                Id = Guid.NewGuid(), CustomerId = Customer, TriggerId = Guid.NewGuid(), Setup = new SurveySetup { Id = Guid.NewGuid() },
                IsSetupActive = true, ExpiresOn = _pipeline.UtcNow.AddDays(expiresInDays),
            };
            _store.Postponed.Add(invitation);
            return invitation;
        }

        private PostponedReleaseResult Run() =>
            RunDueSurveysService.Compose(_store.AsDependencies()).Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1))).Postponed;

        private void SentDaysAgo(int days) =>
            _pipeline.Invitations.Add(new InvitationDraft { CustomerId = Customer, GeneratedOn = _pipeline.UtcNow.AddDays(-days), Status = InvitationStatus.Pending, DedupeKey = "earlier" });

        [Fact]
        public void Run_FatigueWindowEnded_ReleasesTheInvitation()
        {
            var invitation = Postponed();
            SentDaysAgo(31);

            Run();

            Assert.Equal(invitation.Id, Assert.Single(_store.Released));
        }

        [Fact]
        public void Run_StillInsideTheFatigueWindow_LeavesItWaiting()
        {
            Postponed();
            SentDaysAgo(10);

            var result = Run();

            Assert.Equal(1, result.StillWaiting);
            Assert.Empty(_store.Released);
        }

        [Fact]
        public void Run_ExpiredBeforeRelease_DiscardsAndLogsPostponedExpired()
        {
            var invitation = Postponed(expiresInDays: -1);

            Run();

            Assert.Equal(invitation.Id, Assert.Single(_store.Discarded));
            Assert.Equal(SuppressionReason.PostponedExpired, Assert.Single(_pipeline.Suppressions).Reason);
        }

        [Fact]
        public void Run_SetupDeactivated_DiscardsAndLogsInactive()
        {
            Postponed().IsSetupActive = false;

            Run();

            Assert.Equal(SuppressionReason.Inactive, Assert.Single(_pipeline.Suppressions).Reason);
        }

        [Fact]
        public void Run_TwoForTheSameCustomer_ReleasesOnlyTheOldest()
        {
            var oldest = Postponed();
            Postponed();

            Run();

            Assert.Equal(oldest.Id, Assert.Single(_store.Released));
        }

        [Fact]
        public void Run_RowChangedByAnotherRun_LeavesItAndLogsNothing()
        {
            var invitation = Postponed(expiresInDays: -1);
            _store.ChangedElsewhere.Add(invitation.Id);

            var result = Run();

            Assert.Equal(1, result.ChangedElsewhere);
            Assert.Empty(_pipeline.Suppressions);
        }
    }

    public class RetentionPassTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _store;
        private readonly Guid _old = Guid.NewGuid();
        private readonly Guid _oldAnonymised = Guid.NewGuid();
        private readonly Guid _recent = Guid.NewGuid();

        public RetentionPassTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
            _store.Responses[_old] = Tuple.Create(_pipeline.UtcNow.AddDays(-400), true);
            _store.Responses[_oldAnonymised] = Tuple.Create(_pipeline.UtcNow.AddDays(-500), false);
            _store.Responses[_recent] = Tuple.Create(_pipeline.UtcNow.AddDays(-10), true);
        }

        private RetentionResult Run() =>
            RunDueSurveysService.Compose(_store.AsDependencies()).Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1))).Retention;

        [Fact]
        public void Run_NoRetentionPeriod_TouchesNothing()
        {
            Run();

            Assert.Empty(_store.Deleted.Concat(_store.Anonymised));
        }

        [Fact]
        public void Run_PeriodWithoutAMode_TouchesNothingAndSaysSo()
        {
            _pipeline.Settings.RetentionDays = 365;

            var result = Run();

            Assert.Empty(_store.Deleted.Concat(_store.Anonymised));
            Assert.Contains("no mode", result.Outcome);
        }

        [Fact]
        public void Run_DeleteMode_DeletesEveryResponseOlderThanThePeriod()
        {
            _pipeline.Settings.RetentionDays = 365;
            _pipeline.Settings.RetentionMode = RetentionMode.Delete;

            Run();

            Assert.Equal(new[] { _old, _oldAnonymised }.OrderBy(id => id), _store.Deleted.OrderBy(id => id));
        }

        [Fact]
        public void Run_AnonymiseMode_AnonymisesOnlyOldResponsesThatStillNameTheCustomer()
        {
            _pipeline.Settings.RetentionDays = 365;
            _pipeline.Settings.RetentionMode = RetentionMode.Anonymise;

            Run();

            Assert.Equal(_old, Assert.Single(_store.Anonymised));
        }
    }

    public class RunDueSurveysPluginTests
    {
        private static IPluginExecutionContext ContextWith(object runDate)
        {
            var inputs = new ParameterCollection();
            if (runDate != null) inputs[RunDueSurveysPlugin.RunDateParameter] = runDate;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            return context.Object;
        }

        [Fact]
        public void ReadRunDate_Absent_IsTodayInUtc()
        {
            Assert.Equal(new DateTime(2026, 4, 1), RunDueSurveysPlugin.ReadRunDate(ContextWith(null), new DateTime(2026, 4, 1, 22, 30, 0, DateTimeKind.Utc)));
        }

        [Fact]
        public void ReadRunDate_Given_IsUsed()
        {
            Assert.Equal(new DateTime(2026, 4, 1), RunDueSurveysPlugin.ReadRunDate(ContextWith("2026-04-01"), new DateTime(2026, 3, 31, 21, 0, 0, DateTimeKind.Utc)));
        }

        [Fact]
        public void ReadRunDate_NotADate_IsRefused()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => RunDueSurveysPlugin.ReadRunDate(ContextWith("01/04/2026"), DateTime.UtcNow));
        }

        private static IPluginExecutionContext ContextWithPass(string pass)
        {
            var inputs = new ParameterCollection();
            if (pass != null) inputs[RunDueSurveysPlugin.PassParameter] = pass;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            return context.Object;
        }

        [Fact]
        public void ReadPass_Absent_RunsEveryPass()
        {
            Assert.Equal(RunPass.All, RunDueSurveysPlugin.ReadPass(ContextWithPass(null)));
        }

        [Theory]
        [InlineData("OneTime", RunPass.OneTime)]
        [InlineData("daily", RunPass.Daily)]
        [InlineData(" Daily ", RunPass.Daily)]
        [InlineData("", RunPass.All)]
        [InlineData("RecordFailure", RunPass.RecordFailure)]
        [InlineData("recordfailure", RunPass.RecordFailure)]
        public void ReadPass_Given_IsUsedIgnoringCaseAndSpaces(string text, RunPass expected)
        {
            Assert.Equal(expected, RunDueSurveysPlugin.ReadPass(ContextWithPass(text)));
        }

        [Fact]
        public void ReadPass_Unknown_IsRefusedNamingEveryAllowedValue_FR011()
        {
            var refused = Assert.Throws<InvalidPluginExecutionException>(() => RunDueSurveysPlugin.ReadPass(ContextWithPass("Weekly")));

            Assert.Contains("OneTime, Daily, RecordFailure or empty", refused.Message);
        }
    }

    public class CustomerPopulationReaderTests
    {
        private static readonly Guid After = new Guid("aaaaaaaa-0000-0000-0000-000000000005");

        private static PopulationQuery Query() => new PopulationQuery
        {
            Source = new SurveySource(Guid.NewGuid(), "qdb_payment_authorization_ticket", new SourceFields { CustomerLookup = "qdb_customer_name", Type = "qdb_disbursement_type_1" }),
            Period = ScheduleCalendar.PeriodEndingOn(SchedulePeriod.Quarterly, new DateTime(2026, 4, 1)),
            StatusValues = CodeList.Parse("751090050"),
            TypeValues = CodeList.Parse("751090000"),
        };

        private static string Fetch(Guid? after = null) => CustomerPopulationReader.BuildFetchXml(Query(), after, 25);

        // Analysis C3: resuming by page number skips customers when the population shrinks between calls;
        // resuming after the last customer id read cannot.
        [Fact]
        public void BuildFetchXml_Resume_StartsAfterTheLastCustomerReadNotAtAPageNumber_FR003()
        {
            var fetch = Fetch(After);

            Assert.Contains($"<condition attribute='qdb_customer_name' operator='gt' value='{After:D}' />", fetch);
            Assert.Contains("count='25'", fetch);
            Assert.DoesNotContain("page=", fetch);
        }

        [Fact]
        public void BuildFetchXml_FirstPage_HasNoResumeCondition()
        {
            Assert.DoesNotContain("operator='gt'", Fetch());
        }

        [Fact]
        public void BuildFetchXml_OrdersByTheCustomerSoTheResumeConditionMatchesTheOrder()
        {
            Assert.Contains("<order attribute='qdb_customer_name' />", Fetch());
        }

        private static Mock<IOrganizationService> ServiceReturning(params Entity[] rows)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(rows));
            return service;
        }

        private static Entity Ticket(string table, Guid id) => new Entity("qdb_payment_authorization_ticket") { ["qdb_customer_name"] = new EntityReference(table, id) };

        [Fact]
        public void ReadCustomersActiveIn_FewerRowsThanThePage_IsTheLastPage()
        {
            var customer = Guid.NewGuid();

            var page = new CustomerPopulationReader(ServiceReturning(Ticket("account", customer)).Object, CustomerLink.Account).ReadCustomersActiveIn(Query(), null, 25);

            Assert.Equal((true, (Guid?)customer), (page.IsLast, page.LastReadId));
        }

        // A filtered-out row (the other table of a polymorphic lookup) still moves the position on.
        [Fact]
        public void ReadCustomersActiveIn_LastRowNotACustomer_StillMovesThePositionPastIt()
        {
            var contactId = Guid.NewGuid();
            var accountId = Guid.NewGuid();

            var page = new CustomerPopulationReader(ServiceReturning(Ticket("contact", contactId), Ticket("account", accountId)).Object, CustomerLink.Contact).ReadCustomersActiveIn(Query(), null, 2);

            Assert.Equal(new[] { contactId }, page.CustomerIds);
            Assert.Equal(((Guid?)accountId, false), (page.LastReadId, page.IsLast));
        }

        [Fact]
        public void ReadActiveCustomers_Resume_AsksForActiveCustomersAfterTheLastIdInIdOrder_FR003()
        {
            QueryExpression asked = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q).Returns(new EntityCollection());

            new CustomerPopulationReader(service.Object, CustomerLink.Account).ReadActiveCustomers(After, 25);

            Assert.Equal(25, asked.TopCount);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == "accountid" && c.Operator == ConditionOperator.GreaterThan && (Guid)c.Values[0] == After);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == "statecode" && (int)c.Values[0] == 0);
            Assert.Equal(("accountid", OrderType.Ascending), (asked.Orders.Single().AttributeName, asked.Orders.Single().OrderType));
        }

        [Fact]
        public void ReadActiveCustomers_FullPage_IsNotTheLast()
        {
            var rows = Enumerable.Range(0, 2).Select(_ => new Entity("account", Guid.NewGuid())).ToArray();

            var page = new CustomerPopulationReader(ServiceReturning(rows).Object, CustomerLink.Account).ReadActiveCustomers(null, 2);

            Assert.Equal((false, (Guid?)rows[1].Id, 2), (page.IsLast, page.LastReadId, page.CustomerIds.Count));
        }

        [Fact]
        public void BuildFetchXml_Period_LimitsCreatedOnToTheQuarter()
        {
            var fetch = Fetch();

            Assert.Contains("attribute='createdon' operator='ge' value='2026-01-01T00:00:00Z'", fetch);
            Assert.Contains("attribute='createdon' operator='lt' value='2026-04-01T00:00:00Z'", fetch);
        }

        [Fact]
        public void BuildFetchXml_Filters_AreDistinctCustomersInTheStatusesAndTypes()
        {
            var fetch = Fetch();

            Assert.Contains("distinct='true'", fetch);
            Assert.Contains("<condition attribute='statuscode' operator='in'><value>751090050</value></condition>", fetch);
            Assert.Contains("<condition attribute='qdb_disbursement_type_1' operator='in'><value>751090000</value></condition>", fetch);
        }

        [Fact]
        public void ReadCustomersActiveIn_ContactOrgPolymorphicLookup_KeepsOnlyContacts()
        {
            var contactId = Guid.NewGuid();
            var service = ServiceReturning(Ticket("contact", contactId), Ticket("account", Guid.NewGuid()));

            var page = new CustomerPopulationReader(service.Object, CustomerLink.Contact).ReadCustomersActiveIn(Query(), null, 25);

            Assert.Equal(new[] { contactId }, page.CustomerIds);
        }
    }

    public class ScheduledInvitationPageKeyTests
    {
        // Analysis R4: a page checks only its own customers' keys, not every key of the period (10,000 at HL).
        [Fact]
        public void FindExistingDedupeKeys_AsksOnlyForThePagesKeysOfTheSetupAndPeriod_FR003()
        {
            var setup = Guid.NewGuid();
            QueryExpression asked = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q)
                .Returns(new EntityCollection(new[] { new Entity("qdb_survey_invitation") { ["qdb_dedupe_key"] = "k1" } }));

            var found = new ScheduledInvitationReader(service.Object).FindExistingDedupeKeys(setup, "2026-Q4", new[] { "k1", "k2" });

            Assert.Equal(new[] { "k1" }, found);
            var keys = asked.Criteria.Conditions.Single(c => c.AttributeName == "qdb_dedupe_key");
            Assert.Equal(ConditionOperator.In, keys.Operator);
            Assert.Equal(new object[] { "k1", "k2" }, keys.Values);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == "qdb_survey_setup_id" && (Guid)c.Values[0] == setup);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == "qdb_schedule_period_key" && (string)c.Values[0] == "2026-Q4");
        }

        [Fact]
        public void FindExistingDedupeKeys_NoKeys_DoesNotQuery()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);

            Assert.Empty(new ScheduledInvitationReader(service.Object).FindExistingDedupeKeys(Guid.NewGuid(), "2026-Q4", new string[0]));
        }
    }
}

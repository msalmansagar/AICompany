using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// 001-scale-per-org (BRD Addendum E, ADR-011): scheduled triggers run one at a time in priority order,
    /// 25 customers per page, resuming across scheduler calls. The clock moves one second per invitation and
    /// each call gets 60 seconds, so a 300-customer run needs several calls, as a 10,000-customer run does at HL.
    /// </summary>
    public class ScheduledPagedRunTests
    {
        private static readonly DateTime NewYear = new DateTime(2027, 1, 1);
        private static readonly TimeSpan CallAllowance = TimeSpan.FromSeconds(60);
        private const string HighId = "00000000-0000-0000-0000-0000000000a1";
        private const string LowId = "00000000-0000-0000-0000-0000000000a2";

        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore
        {
            UtcNow = new DateTime(2027, 1, 1, 6, 0, 0, DateTimeKind.Utc),
            TimePerInvitation = TimeSpan.FromSeconds(1),
            Settings = new SurveySettings { StuckAfterFailedCalls = 3 },
        };

        private readonly InMemorySchedulingStore _store;

        public ScheduledPagedRunTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
        }

        private static IEnumerable<Guid> Customers(int count) =>
            Enumerable.Range(1, count).Select(i => new Guid($"{i:D8}-0000-0000-0000-000000000000"));

        private SurveyTrigger Scheduled(string formCode, string id = HighId, SchedulePeriod period = SchedulePeriod.Quarterly)
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

        private RunSummary Call(DateTime runDate, RunPass pass = RunPass.Daily) =>
            RunDueSurveysService.Compose(_store.AsDependencies()).Run(runDate, new RunBudget(_pipeline, CallAllowance), pass);

        private List<RunSummary> CallUntilComplete(DateTime runDate, int maxCalls = 30)
        {
            var calls = new List<RunSummary>();
            do calls.Add(Call(runDate)); while (!calls.Last().IsComplete && calls.Count < maxCalls);
            return calls;
        }

        private ScheduledRunState RunOf(string triggerId) => _store.Runs[new Guid(triggerId)];

        private int InvitationsFor(string formCode) => _pipeline.Invitations.Count(i => i.FormCode == formCode);

        // ── US1: a large scheduled survey reaches everyone (FR-001, FR-005, FR-007, FR-010) ──

        [Fact]
        public void Run_LargePopulationCutByTheBudget_ResumesAcrossCallsWithOneInvitationPerCustomer_FR001()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            var calls = CallUntilComplete(NewYear);

            Assert.True(calls.Count > 1, $"one call did it all ({calls.Count})");
            Assert.Equal(300, _pipeline.Invitations.Select(i => i.CustomerId).Distinct().Count());
            Assert.Equal(300, _pipeline.Invitations.Count);
        }

        [Fact]
        public void Run_FirstCallCutByTheBudget_SaysToCallAgain()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            Assert.False(Call(NewYear).IsComplete);
        }

        [Fact]
        public void Run_EachPage_SavesTheProgressOnTheTrigger_FR005()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            Call(NewYear);

            var run = RunOf(HighId);
            Assert.Equal((ScheduledRunStatus.Sending, "2026-Q4", _pipeline.Invitations.Count, _pipeline.Invitations.Count),
                (run.Status, run.PeriodKey, run.Evaluated, run.Invited));
            Assert.Equal(_pipeline.Invitations.Max(i => i.CustomerId), run.LastCustomerId);
            Assert.Equal(_pipeline.UtcNow, run.ProgressOn);
            Assert.NotNull(run.StartedOn);
        }

        [Fact]
        public void Run_LastPage_MarksTheRunSentWithTheTotals_FR005()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            CallUntilComplete(NewYear);

            var run = RunOf(HighId);
            Assert.Equal((ScheduledRunStatus.Sent, 300, 300, 0), (run.Status, run.Evaluated, run.Invited, run.FailedCalls));
        }

        [Fact]
        public void Run_WhileRunning_SummaryNamesTheSurveyPeriodAndProgress_FR005()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            var text = Call(NewYear).Scheduled.ToString();

            var evaluated = RunOf(HighId).Evaluated;
            Assert.Contains($"srv-quarterly 2026-Q4 running, {evaluated} evaluated ({evaluated} invited, 0 postponed, 0 suppressed)", text);
        }

        [Fact]
        public void Run_Completed_SummarySaysCompletedWithTheTotals_FR005()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));

            var text = CallUntilComplete(NewYear).Last().Scheduled.ToString();

            Assert.Contains("srv-quarterly 2026-Q4 completed, 300 evaluated (300 invited, 0 postponed, 0 suppressed)", text);
        }

        [Fact]
        public void Run_TwoTriggersDue_RunsTheHigherPriorityToCompletionBeforeStartingTheOther_FR010()
        {
            Scheduled("srv-low", LowId).Priority = 2;
            Scheduled("srv-high", HighId).Priority = 1;
            _store.ActiveCustomers.AddRange(Customers(100));

            Call(NewYear);
            var lowAfterFirstCall = InvitationsFor("srv-low");
            CallUntilComplete(NewYear);

            Assert.Equal(0, lowAfterFirstCall);
            Assert.Equal(ScheduledRunStatus.Sent, RunOf(HighId).Status);
            Assert.Equal(ScheduledRunStatus.Sent, RunOf(LowId).Status);
        }

        // Same-day surveys now run one after another, so the second meets the 30-day fatigue rule (CEO-accepted R-E4).
        [Fact]
        public void Run_TwoTriggersDueForOneCustomerAndTheLowerDrops_LogsFatigue_FR007()
        {
            Scheduled("srv-high", HighId).Priority = 1;
            var low = Scheduled("srv-low", LowId);
            low.Priority = 2;
            low.FatigueAction = FatigueAction.Drop;
            _store.ActiveCustomers.AddRange(Customers(1));

            CallUntilComplete(NewYear);

            Assert.Equal(0, InvitationsFor("srv-low"));
            Assert.Equal(SuppressionReason.Fatigue, Assert.Single(_pipeline.Suppressions).Reason);
        }

        [Fact]
        public void Run_PreviousPeriodStillSending_FinishesItBeforeStartingTheNext_FR006()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(30));
            _store.TrySave(new Guid(HighId), new ScheduledRunState { Status = ScheduledRunStatus.Sending, PeriodKey = "2026-Q3", RowVersion = "0" });
            _pipeline.Settings.FatigueMinDays = 0;

            CallUntilComplete(NewYear);

            var periods = _pipeline.Invitations.Select(i => i.SchedulePeriodKey).ToList();
            Assert.Equal((30, 30), (periods.Count(p => p == "2026-Q3"), periods.Count(p => p == "2026-Q4")));
            Assert.True(periods.LastIndexOf("2026-Q3") < periods.IndexOf("2026-Q4"), "Q4 started before Q3 finished");
        }

        [Fact]
        public void Run_ResumedPreviousPeriod_KeepsThatPeriodsFixedExpiry_FR002()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(1));
            _store.TrySave(new Guid(HighId), new ScheduledRunState { Status = ScheduledRunStatus.Sending, PeriodKey = "2026-Q3", RowVersion = "0" });

            Call(NewYear.AddDays(1));

            Assert.Equal(new DateTime(2026, 11, 1), _pipeline.Invitations.Single(i => i.SchedulePeriodKey == "2026-Q3").ExpiresOn);
        }

        [Fact]
        public void Run_AnotherCallChangedTheTrigger_SendsNothingAndSaysCallAgain()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));
            _store.ChangedAfterRead = new Guid(HighId);

            var summary = Call(NewYear);

            Assert.Empty(_pipeline.Invitations);
            Assert.False(summary.IsComplete);
        }

        [Fact]
        public void Run_SetupSwitchedOffMidRun_SendsNothingMore()
        {
            var trigger = Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));
            Call(NewYear);
            var sentBefore = _pipeline.Invitations.Count;
            _store.ScheduledTriggers.Remove(trigger);

            CallUntilComplete(NewYear);

            Assert.Equal(sentBefore, _pipeline.Invitations.Count);
        }

        [Fact]
        public void Run_ActiveInPeriodCustomersLeaveBetweenCalls_NoRemainingCustomerIsSkipped_SC003()
        {
            var trigger = Scheduled("srv-quarterly");
            trigger.Schedule.Population = SchedulePopulation.ActiveInPeriod;
            trigger.Schedule.PopulationSource = new SurveySource(Guid.NewGuid(), "qdb_payment_authorization_ticket", new SourceFields { CustomerLookup = "qdb_customer_name" });
            _store.CustomersActiveInPeriod.AddRange(Customers(200));
            Call(NewYear);
            _store.CustomersActiveInPeriod.RemoveRange(0, 20);

            CallUntilComplete(NewYear);

            var invited = new HashSet<Guid>(_pipeline.Invitations.Select(i => i.CustomerId));
            Assert.All(_store.CustomersActiveInPeriod, customer => Assert.Contains(customer, invited));
            Assert.Equal(_pipeline.Invitations.Count, invited.Count);
        }

        [Fact]
        public void Run_ForeseeableProblemPerCustomerInPagedMode_LogsEachAndCompletes_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(60));
            _pipeline.PublishedVersions.Clear();

            CallUntilComplete(NewYear);

            Assert.Equal(60, _pipeline.Suppressions.Count(s => s.Reason == SuppressionReason.FormNotPublished));
            Assert.Equal((ScheduledRunStatus.Sent, 60, 60), (RunOf(HighId).Status, RunOf(HighId).Evaluated, RunOf(HighId).Suppressed));
        }

        [Fact]
        public void Run_SmallOrg_FitsInOneCall_FR007()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(40));
            _pipeline.TimePerInvitation = TimeSpan.Zero;

            Assert.True(Call(NewYear).IsComplete);
            Assert.Equal(40, _pipeline.Invitations.Count);
        }

        // ── US2: interruptions lose only their own work; repeated failures mark the run Stuck (FR-003, FR-004, FR-011) ──

        private sealed class Snapshot
        {
            public List<InvitationDraft> Invitations;
            public List<SuppressionEntry> Suppressions;
            public Dictionary<Guid, ScheduledRunState> Runs;
            public DateTime? GateDate;
        }

        private Snapshot Take() => new Snapshot
        {
            Invitations = _pipeline.Invitations.ToList(), Suppressions = _pipeline.Suppressions.ToList(),
            Runs = _store.Runs.ToDictionary(kv => kv.Key, kv => kv.Value.Copy()), GateDate = _store.OneTime.DailyPassesCompletedOn,
        };

        // A failed Custom API call is one transaction: CRM undoes everything it wrote.
        private void RollBackTo(Snapshot snapshot)
        {
            _pipeline.Invitations.Clear();
            _pipeline.Invitations.AddRange(snapshot.Invitations);
            _pipeline.Suppressions.Clear();
            _pipeline.Suppressions.AddRange(snapshot.Suppressions);
            _store.Runs.Clear();
            foreach (var run in snapshot.Runs) _store.Runs[run.Key] = run.Value;
            _store.OneTime.DailyPassesCompletedOn = snapshot.GateDate;
        }

        private void FailingCall(DateTime runDate, Guid faultOn)
        {
            var before = Take();
            _pipeline.FaultOnCustomer = faultOn;
            Assert.ThrowsAny<Exception>(() => Call(runDate));
            RollBackTo(before);
            _pipeline.FaultOnCustomer = null;
        }

        [Fact]
        public void Run_CallFailsMidRun_NextCallRedoesOnlyTheLostWorkWithNoDuplicatesOrGaps_SC003()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(200));
            Call(NewYear);
            var committed = _pipeline.Invitations.Count;
            FailingCall(NewYear, Customers(200).ElementAt(committed + 30));

            CallUntilComplete(NewYear);

            Assert.Equal(200, _pipeline.Invitations.Count);
            Assert.Equal(200, _pipeline.Invitations.Select(i => i.CustomerId).Distinct().Count());
        }

        [Fact]
        public void RecordFailure_RunInProgress_CountsTheFailedCall_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));
            Call(NewYear);

            Call(NewYear, RunPass.RecordFailure);

            Assert.Equal((ScheduledRunStatus.Sending, 1), (RunOf(HighId).Status, RunOf(HighId).FailedCalls));
        }

        [Fact]
        public void RecordFailure_AtTheThreshold_MarksTheRunStuckWithAReason_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));
            Call(NewYear);

            for (var i = 0; i < 3; i++) Call(NewYear, RunPass.RecordFailure);

            Assert.Equal((ScheduledRunStatus.Stuck, 3), (RunOf(HighId).Status, RunOf(HighId).FailedCalls));
            Assert.Contains("failed 3 time(s) in a row while this survey was next", RunOf(HighId).Message);
        }

        // Analysis C1: a failure on the very first page rolls back the Sending status, so the target is the
        // trigger the Daily pass would work on next, not only a Sending one.
        [Fact]
        public void RecordFailure_FirstPageKeepsFailing_StillReachesStuck_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));

            for (var i = 0; i < 3; i++)
            {
                FailingCall(NewYear, Customers(10).First());
                Call(NewYear, RunPass.RecordFailure);
            }

            Assert.Equal((ScheduledRunStatus.Stuck, "2026-Q4", 3), (RunOf(HighId).Status, RunOf(HighId).PeriodKey, RunOf(HighId).FailedCalls));
            Assert.Empty(_pipeline.Invitations);
        }

        [Fact]
        public void RecordFailure_BelowTheThreshold_ADueTriggerStaysNotSentAndKeepsItsCount()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));

            Call(NewYear, RunPass.RecordFailure);

            Assert.Equal((ScheduledRunStatus.NotSent, 1), (RunOf(HighId).Status, RunOf(HighId).FailedCalls));
        }

        [Fact]
        public void RecordFailure_NothingDueOrRunning_RecordsNothingAndSaysSo()
        {
            Scheduled("srv-quarterly");

            var summary = Call(new DateTime(2027, 2, 10), RunPass.RecordFailure);

            Assert.Empty(_store.Runs);
            Assert.Contains("nothing to record", summary.ToString());
        }

        [Fact]
        public void RecordFailure_ThresholdNotSet_IsRefusedNamingTheSetting_FR011()
        {
            Scheduled("srv-quarterly");
            _pipeline.Settings.StuckAfterFailedCalls = null;

            var refused = Assert.Throws<ScheduledRunRefusedException>(() => Call(NewYear, RunPass.RecordFailure));

            Assert.Contains("Stuck After Failed Calls", refused.Message);
        }

        // Seen live 2026-11-22: the RecordFailure answer said "not run in this call (Pass = Daily)".
        [Fact]
        public void RecordFailure_Summary_DoesNotNameAnotherPass()
        {
            Scheduled("srv-quarterly");

            Assert.DoesNotContain("Pass = Daily", Call(new DateTime(2027, 2, 10), RunPass.RecordFailure).ToString());
        }

        [Fact]
        public void RecordFailure_NeverSendsAnything()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));

            Call(NewYear, RunPass.RecordFailure);

            Assert.Empty(_pipeline.Invitations);
        }

        [Fact]
        public void Run_SavedPageAfterFailures_ResetsTheFailedCallCount_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));
            Call(NewYear);
            Call(NewYear, RunPass.RecordFailure);

            Call(NewYear);

            Assert.Equal(0, RunOf(HighId).FailedCalls);
        }

        private void StuckToday(string triggerId, string periodKey)
        {
            _store.TrySave(new Guid(triggerId), new ScheduledRunState
            {
                Status = ScheduledRunStatus.Stuck, PeriodKey = periodKey, FailedCalls = 3, ProgressOn = _pipeline.UtcNow, Message = "stuck", RowVersion = "0",
            });
        }

        [Fact]
        public void Run_HigherPriorityRunStuck_SkipsItSoTheNextSurveyIsSent_FR011()
        {
            Scheduled("srv-high", HighId).Priority = 1;
            Scheduled("srv-low", LowId).Priority = 2;
            _store.ActiveCustomers.AddRange(Customers(10));
            StuckToday(HighId, "2026-Q4");

            var summary = CallUntilComplete(NewYear).Last();

            Assert.Equal((0, 10), (InvitationsFor("srv-high"), InvitationsFor("srv-low")));
            Assert.Contains("srv-high 2026-Q4 is Stuck", summary.Scheduled.ToString());
        }

        // Code review 2026-11-22: with the higher-priority run Stuck and set aside, a failed call was working on the next
        // survey, so that one is counted; the Stuck run's count is left alone.
        [Fact]
        public void RecordFailure_HigherPriorityRunStuck_CountsTheNextSurvey_FR011()
        {
            Scheduled("srv-high", HighId).Priority = 1;
            Scheduled("srv-low", LowId).Priority = 2;
            StuckToday(HighId, "2026-Q4");

            Call(NewYear, RunPass.RecordFailure);

            Assert.Equal((3, 1), (RunOf(HighId).FailedCalls, RunOf(LowId).FailedCalls));
        }

        // Analysis C2: a Stuck run does not hold the daily gate open.
        [Fact]
        public void Run_OnlyStuckRunsLeft_CompletesTheDay()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));
            StuckToday(HighId, "2026-Q4");

            Assert.True(Call(NewYear).IsComplete);
            Assert.Equal(NewYear, _store.OneTime.DailyPassesCompletedOn);
        }

        // Analysis C2: on 2 January a quarterly trigger is not due, but its Stuck run is still picked up and retried.
        [Fact]
        public void Run_StuckRunOnALaterDay_IsRetriedAndFinishes_FR011()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));
            StuckToday(HighId, "2026-Q4");
            _store.OneTime.DailyPassesCompletedOn = NewYear;
            _pipeline.UtcNow = _pipeline.UtcNow.AddDays(1);

            CallUntilComplete(NewYear.AddDays(1));

            Assert.Equal((ScheduledRunStatus.Sent, 0, 10), (RunOf(HighId).Status, RunOf(HighId).FailedCalls, InvitationsFor("srv-quarterly")));
        }

        [Fact]
        public void Run_StuckRunTheSameDay_IsNotRetriedAgain()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(10));
            StuckToday(HighId, "2026-Q4");

            Call(NewYear);

            Assert.Empty(_pipeline.Invitations);
        }

        // FR-004: the scheduler was down for days in the middle of a run; the catch-up resumes from the saved position.
        [Fact]
        public void Run_SchedulerDownMidRun_ResumesFromTheSavedPositionAfterMissedDays_FR004()
        {
            Scheduled("srv-quarterly");
            _store.ActiveCustomers.AddRange(Customers(300));
            _store.OneTime.DailyPassesCompletedOn = NewYear.AddDays(-1);
            Call(NewYear);
            var sentBefore = _pipeline.Invitations.Count;

            CallUntilComplete(NewYear.AddDays(3));

            Assert.True(sentBefore > 0 && sentBefore < 300, sentBefore.ToString());
            Assert.Equal(300, _pipeline.Invitations.Select(i => i.CustomerId).Distinct().Count());
            Assert.Equal(300, _pipeline.Invitations.Count);
        }
    }
}

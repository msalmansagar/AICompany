using System;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    // ── ScheduledRunStore (001-scale-per-org, data-model.md Scheduled run progress) ──

    public class ScheduledRunStoreTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();
        private static readonly Guid Trigger = new Guid("00000000-0000-0000-0000-0000000000d1");
        private static readonly Guid LastCustomer = new Guid("aaaaaaaa-0000-0000-0000-000000000009");

        private ScheduledRunStore Store() => new ScheduledRunStore(_service.Object);

        private UpdateRequest CaptureUpdate(string newVersion)
        {
            UpdateRequest sent = null;
            _service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Callback<OrganizationRequest>(r => sent = (UpdateRequest)r).Returns(new UpdateResponse());
            _service.Setup(s => s.Retrieve("qdb_survey_trigger", Trigger, It.IsAny<ColumnSet>())).Returns(new Entity("qdb_survey_trigger") { RowVersion = newVersion });
            Store().TrySave(Trigger, new ScheduledRunState
            {
                Status = ScheduledRunStatus.Sending, PeriodKey = "2026-Q4", LastCustomerId = LastCustomer, Evaluated = 50, Invited = 40, Postponed = 6, Suppressed = 4,
                FailedCalls = 0, StartedOn = new DateTime(2027, 1, 1, 6, 0, 0), ProgressOn = new DateTime(2027, 1, 1, 6, 5, 0), Message = "running", RowVersion = "7",
            });
            return sent;
        }

        [Fact]
        public void TrySave_IsConditionalOnTheStateRowVersion_FR004()
        {
            var sent = CaptureUpdate("8");

            Assert.Equal(("7", ConcurrencyBehavior.IfRowVersionMatches), (sent.Target.RowVersion, sent.ConcurrencyBehavior));
        }

        [Fact]
        public void TrySave_WritesEveryRunColumn_FR005()
        {
            var target = CaptureUpdate("8").Target;

            Assert.Equal(
                ((int)ScheduledRunStatus.Sending, "2026-Q4", LastCustomer.ToString("D"), 50, 40, 6, 4, 0, "running"),
                (target.GetAttributeValue<OptionSetValue>("qdb_run_status").Value, target.GetAttributeValue<string>("qdb_run_period_key"),
                 target.GetAttributeValue<string>("qdb_run_cursor"), target.GetAttributeValue<int>("qdb_run_evaluated_count"),
                 target.GetAttributeValue<int>("qdb_invited_count"), target.GetAttributeValue<int>("qdb_postponed_count"),
                 target.GetAttributeValue<int>("qdb_suppressed_count"), target.GetAttributeValue<int>("qdb_run_failed_calls"),
                 target.GetAttributeValue<string>("qdb_run_message")));
            Assert.Equal(new DateTime(2027, 1, 1, 6, 5, 0), target.GetAttributeValue<DateTime>("qdb_run_progress_on"));
        }

        [Fact]
        public void TrySave_Saved_ReturnsTheNewRowVersion()
        {
            CaptureUpdate("8");

            var write = Store().TrySave(Trigger, new ScheduledRunState { RowVersion = "8" });

            Assert.Equal((true, "8"), (write.IsSaved, write.RowVersion));
        }

        [Fact]
        public void TrySave_RowChangedElsewhere_IsNotSavedAndDoesNotThrow_FR003()
        {
            var fault = new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882) });
            _service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Throws(fault);

            Assert.False(Store().TrySave(Trigger, new ScheduledRunState { RowVersion = "1" }).IsSaved);
        }

        [Fact]
        public void TrySave_LongMessage_IsCutToTheColumnLimit_FR011()
        {
            UpdateRequest sent = null;
            _service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Callback<OrganizationRequest>(r => sent = (UpdateRequest)r).Returns(new UpdateResponse());
            _service.Setup(s => s.Retrieve("qdb_survey_trigger", Trigger, It.IsAny<ColumnSet>())).Returns(new Entity("qdb_survey_trigger") { RowVersion = "2" });

            Store().TrySave(Trigger, new ScheduledRunState { Status = ScheduledRunStatus.Stuck, Message = new string('x', 5000), RowVersion = "1" });

            Assert.Equal(ScheduledRunState.MessageMaxLength, sent.Target.GetAttributeValue<string>("qdb_run_message").Length);
        }
    }

    // ── ScheduledTriggerRepository reads the run record with the trigger ──

    public class ScheduledTriggerRunMappingTests
    {
        private static Entity Row(Action<Entity> fill)
        {
            var row = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Scheduled),
                ["qdb_schedule_period"] = new OptionSetValue((int)SchedulePeriod.Quarterly),
                ["createdon"] = new DateTime(2026, 1, 1),
                ["setup.qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", Guid.NewGuid()),
                ["setup.qdb_form_code"] = new AliasedValue("qdb_survey_setup", "qdb_form_code", "srv-quarterly"),
            };
            row.RowVersion = "33";
            fill(row);
            return row;
        }

        private static ScheduledRunState ReadRun(Entity row)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { row }));
            return new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers().Single().Schedule.Run;
        }

        [Fact]
        public void GetActiveScheduledTriggers_RunColumns_MapToTheRunState_FR004()
        {
            var last = Guid.NewGuid();
            var run = ReadRun(Row(row =>
            {
                row["qdb_run_status"] = new OptionSetValue((int)ScheduledRunStatus.Stuck);
                row["qdb_run_period_key"] = "2026-Q4";
                row["qdb_run_cursor"] = last.ToString("D");
                row["qdb_run_evaluated_count"] = 300;
                row["qdb_invited_count"] = 250;
                row["qdb_run_failed_calls"] = 3;
                row["qdb_run_progress_on"] = new DateTime(2027, 1, 1, 7, 0, 0);
            }));

            Assert.Equal((ScheduledRunStatus.Stuck, "2026-Q4", (Guid?)last, 300, 250, 3, "33"),
                (run.Status, run.PeriodKey, run.LastCustomerId, run.Evaluated, run.Invited, run.FailedCalls, run.RowVersion));
        }

        [Fact]
        public void GetActiveScheduledTriggers_NoRunYet_IsNotSentFromTheStart()
        {
            var run = ReadRun(Row(row => { }));

            Assert.Equal((ScheduledRunStatus.NotSent, (string)null, (Guid?)null, 0, "33"), (run.Status, run.PeriodKey, run.LastCustomerId, run.FailedCalls, run.RowVersion));
        }

        // A One-time cursor ("3|cookie") left on a trigger whose kind was changed is not a customer id.
        [Fact]
        public void GetActiveScheduledTriggers_CursorNotACustomerId_StartsFromTheFirstCustomer()
        {
            var run = ReadRun(Row(row => row["qdb_run_cursor"] = "3|<cookie/>"));

            Assert.Null(run.LastCustomerId);
        }

        [Fact]
        public void GetActiveScheduledTriggers_AsksForTheRunColumnsAndRowVersion()
        {
            QueryExpression asked = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q).Returns(new EntityCollection());

            new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers();

            Assert.Superset(new System.Collections.Generic.HashSet<string>(new[]
            {
                "qdb_run_status", "qdb_run_period_key", "qdb_run_cursor", "qdb_run_evaluated_count", "qdb_invited_count", "qdb_postponed_count",
                "qdb_suppressed_count", "qdb_run_failed_calls", "qdb_run_started_on", "qdb_run_progress_on", "qdb_run_message", "versionnumber",
            }), new System.Collections.Generic.HashSet<string>(asked.ColumnSet.Columns));
        }
    }

    // ── Survey Settings: the Stuck threshold (Article V: no value in code) ──

    public class StuckThresholdSettingTests
    {
        private static SurveySettings Read(object value)
        {
            var row = new Entity("qdb_survey_settings", Guid.NewGuid());
            if (value != null) row["qdb_stuck_after_failed_calls"] = value;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { row }));
            return new SurveyConfigRepository(service.Object).GetSettings();
        }

        [Fact]
        public void GetSettings_StuckThreshold_IsRead_FR011()
        {
            Assert.Equal(4, Read(4).StuckAfterFailedCalls);
        }

        [Fact]
        public void GetSettings_StuckThresholdEmpty_IsReportedMissingNotDefaulted_FR011()
        {
            Assert.Null(Read(null).StuckAfterFailedCalls);
        }
    }

    // ── ScheduleCalendar: a stored period key back to its period (resuming an unfinished run) ──

    public class PeriodFromKeyTests
    {
        [Theory]
        [InlineData(SchedulePeriod.Monthly, "2026-12", "2026-12-01", "2027-01-01")]
        [InlineData(SchedulePeriod.Quarterly, "2026-Q4", "2026-10-01", "2027-01-01")]
        [InlineData(SchedulePeriod.Annually, "2026", "2026-01-01", "2027-01-01")]
        public void PeriodFromKey_StoredKey_IsTheSamePeriodTheRunStartedFor_FR006(SchedulePeriod period, string key, string start, string end)
        {
            var reviewed = ScheduleCalendar.PeriodFromKey(period, key);

            Assert.Equal((DateTime.Parse(start), DateTime.Parse(end), key), (reviewed.Start, reviewed.EndExclusive, reviewed.Key));
        }

        [Fact]
        public void PeriodFromKey_RoundTripsPeriodEndingOn()
        {
            var expected = ScheduleCalendar.PeriodEndingOn(SchedulePeriod.Quarterly, new DateTime(2027, 4, 1));

            Assert.Equal(expected.Start, ScheduleCalendar.PeriodFromKey(SchedulePeriod.Quarterly, expected.Key).Start);
        }

        [Theory]
        [InlineData(SchedulePeriod.Monthly, "2026-12", "2027-01", "2027-02-01")]
        [InlineData(SchedulePeriod.Quarterly, "2026-Q3", "2026-Q4", "2027-01-01")]
        [InlineData(SchedulePeriod.Annually, "2026", "2027", "2028-01-01")]
        public void FollowingPeriod_StoredPeriod_IsTheNextOneAndFallsDueAtItsEnd_FR006(SchedulePeriod period, string key, string nextKey, string dueOn)
        {
            var next = ScheduleCalendar.FollowingPeriod(period, ScheduleCalendar.PeriodFromKey(period, key));

            Assert.Equal((nextKey, DateTime.Parse(dueOn)), (next.Key, next.EndExclusive));
        }

        [Fact]
        public void PeriodFromKey_UnreadableKey_IsRefused()
        {
            Assert.Throws<FormatException>(() => ScheduleCalendar.PeriodFromKey(SchedulePeriod.Quarterly, "2026-12"));
        }
    }
}

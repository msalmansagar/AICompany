using System;
using System.Linq;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class MissedRunDaysTests
    {
        private static readonly DateTime RunDate = new DateTime(2027, 1, 2);

        [Fact]
        public void Plan_TwoDaysMissed_RunsEachDayInOrder()
        {
            var plan = MissedRunDays.Plan(new DateTime(2026, 12, 30), RunDate);

            Assert.Equal(new[] { new DateTime(2026, 12, 31), new DateTime(2027, 1, 1), RunDate }, plan.Dates);
        }

        [Fact]
        public void Plan_AlreadyCompletedToday_RunsNothing()
        {
            Assert.True(MissedRunDays.Plan(RunDate, RunDate.AddHours(9)).IsAlreadyCompleted);
        }

        [Fact]
        public void Plan_NeverCompleted_RunsOnlyTheRunDate()
        {
            Assert.Equal(new[] { RunDate }, MissedRunDays.Plan(null, RunDate).Dates);
        }

        [Fact]
        public void Plan_EarlierDateReRun_RunsOnlyThatDate()
        {
            Assert.Equal(new[] { RunDate }, MissedRunDays.Plan(RunDate.AddDays(3), RunDate).Dates);
        }

        [Fact]
        public void Plan_FortyDaysMissed_CatchesUpTheLast28()
        {
            var plan = MissedRunDays.Plan(RunDate.AddDays(-41), RunDate);

            Assert.Equal(MissedRunDays.MaxCatchUpDays, plan.Dates.Count);
            Assert.Equal(RunDate, plan.Dates.Last());
        }

        [Fact]
        public void Plan_FortyDaysMissed_NamesTheDaysTooOldToCatchUp()
        {
            var plan = MissedRunDays.Plan(RunDate.AddDays(-41), RunDate);

            Assert.Equal((RunDate.AddDays(-40), RunDate.AddDays(-28), 13), (plan.TooOldFrom, plan.TooOldTo, plan.TooOldCount));
        }
    }
}

using System;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class MilestoneRuleTests
    {
        private static int? Fire(int qualifying, int beforeActivation = 0, int lastFired = 0, bool skipReached = true, int everyN = 5) =>
            MilestoneRule.IndexToFire(new MilestoneSettings { EveryN = everyN, SkipReached = skipReached },
                new MilestoneCounts { Qualifying = qualifying, QualifyingBeforeActivation = beforeActivation, LastFiredIndex = lastFired });

        [Fact]
        public void IndexToFire_FifthRecord_FiresIndexOne()
        {
            Assert.Equal(1, Fire(5));
        }

        [Fact]
        public void IndexToFire_FourthRecord_FiresNothing()
        {
            Assert.Null(Fire(4));
        }

        [Fact]
        public void IndexToFire_IndexAlreadyFired_FiresNothing()
        {
            Assert.Null(Fire(9, lastFired: 1));
        }

        [Fact]
        public void IndexToFire_TenthRecordAfterIndexOne_FiresIndexTwo()
        {
            Assert.Equal(2, Fire(10, lastFired: 1));
        }

        [Fact]
        public void IndexToFire_SevenAtActivationWithSkip_WaitsForTheTenth()
        {
            Assert.Null(Fire(8, beforeActivation: 7));
            Assert.Equal(2, Fire(10, beforeActivation: 7));
        }

        [Fact]
        public void IndexToFire_SevenAtActivationWithoutSkip_FiresTheOverdueIndexNow()
        {
            Assert.Equal(1, Fire(8, beforeActivation: 7, skipReached: false));
        }

        [Fact]
        public void IndexToFire_NChangedToTen_UsesTheNewN()
        {
            Assert.Null(Fire(9, everyN: 10));
        }

        [Fact]
        public void IndexToFire_NBelowOne_FiresNothing()
        {
            Assert.Null(Fire(5, everyN: 0));
        }
    }

    public class PriorityRuleTests
    {
        private static SurveyTrigger Trigger(TriggerKind kind, int? priority = null, string id = "00000000-0000-0000-0000-000000000001") =>
            new SurveyTrigger { Kind = kind, Priority = priority, Id = new Guid(id) };

        [Fact]
        public void Compare_DefaultPriorities_MilestoneWins()
        {
            Assert.True(PriorityRule.Compare(Trigger(TriggerKind.Milestone), Trigger(TriggerKind.Event)) < 0);
        }

        [Fact]
        public void Compare_ConfiguredPriority_OverridesTheMilestoneDefault()
        {
            Assert.True(PriorityRule.Compare(Trigger(TriggerKind.Event, priority: -1), Trigger(TriggerKind.Milestone)) < 0);
        }

        [Fact]
        public void Compare_EqualPriorityAndKind_OrdersByIdDeterministically()
        {
            var first = Trigger(TriggerKind.Event, 10, "00000000-0000-0000-0000-000000000001");
            var second = Trigger(TriggerKind.Event, 10, "00000000-0000-0000-0000-000000000002");

            Assert.True(PriorityRule.Compare(first, second) < 0);
        }
    }

    public class FatiguePolicyTests
    {
        private static readonly DateTime Now = new DateTime(2026, 11, 10, 9, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void BlockingSince_ThirtyDays_IsThirtyDaysBack()
        {
            Assert.Equal(Now.AddDays(-30), FatiguePolicy.BlockingSince(new SurveySettings { FatigueMinDays = 30 }, Now));
        }

        [Fact]
        public void BlockingSince_Zero_SwitchesTheLimitOff()
        {
            Assert.Null(FatiguePolicy.BlockingSince(new SurveySettings { FatigueMinDays = 0 }, Now));
        }

        [Theory]
        [InlineData(TriggerKind.Event, FatigueAction.Drop)]
        [InlineData(TriggerKind.Created, FatigueAction.Drop)]
        [InlineData(TriggerKind.Milestone, FatigueAction.Postpone)]
        [InlineData(TriggerKind.Scheduled, FatigueAction.Postpone)]
        public void ActionFor_Unset_UsesTheKindDefault(TriggerKind kind, FatigueAction expected)
        {
            Assert.Equal(expected, FatiguePolicy.ActionFor(new SurveyTrigger { Kind = kind }));
        }

        [Fact]
        public void ActionFor_Configured_UsesTheTriggerSetting()
        {
            Assert.Equal(FatigueAction.Postpone, FatiguePolicy.ActionFor(new SurveyTrigger { Kind = TriggerKind.Event, FatigueAction = FatigueAction.Postpone }));
        }
    }

    public class MilestoneMatcherTests
    {
        private static readonly SurveyTrigger Milestone = new SurveyTrigger
        {
            Kind = TriggerKind.Milestone,
            Milestone = new MilestoneSettings { StatusValues = CodeList.Parse("751090050"), TypeValues = CodeList.Parse("751090000") },
        };

        [Fact]
        public void Matches_QualifyingRecordEntersCountedStatus_Fires()
        {
            Assert.True(TriggerMatcher.Matches(Milestone, new RecordChange { Message = ChangeMessage.Update, OldStatus = "1", NewStatus = "751090050", Type = "751090000" }));
        }

        [Fact]
        public void Matches_TypeNotCounted_DoesNotFire()
        {
            Assert.False(TriggerMatcher.Matches(Milestone, new RecordChange { Message = ChangeMessage.Update, OldStatus = "1", NewStatus = "751090050", Type = "751090001" }));
        }

        [Fact]
        public void Matches_CreatedAlreadyCounted_Fires()
        {
            Assert.True(TriggerMatcher.Matches(Milestone, new RecordChange { Message = ChangeMessage.Create, NewStatus = "751090050", Type = "751090000" }));
        }

        [Fact]
        public void ForMilestone_Index_KeysOnTheIndexNotTheRecord()
        {
            var setupId = new Guid("11111111-1111-1111-1111-111111111111");
            var customerId = new Guid("22222222-2222-2222-2222-222222222222");

            Assert.Equal("11111111-1111-1111-1111-111111111111|22222222-2222-2222-2222-222222222222|M2", DedupeKey.ForMilestone(setupId, customerId, 2));
        }
    }
}

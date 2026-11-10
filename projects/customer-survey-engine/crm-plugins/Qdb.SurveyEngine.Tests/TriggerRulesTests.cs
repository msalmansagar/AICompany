using System;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class CodeListTests
    {
        [Fact]
        public void Parse_CommaAndSpaceSeparated_ContainsEachCode()
        {
            var list = CodeList.Parse(" 100000003, 100000004 ;751090002 ");

            Assert.True(list.Contains("100000004") && list.Contains("751090002"));
        }

        [Fact]
        public void Parse_Blank_IsEmpty()
        {
            Assert.True(CodeList.Parse("  ").IsEmpty);
        }

        [Fact]
        public void Contains_Null_IsFalse()
        {
            Assert.False(CodeList.Parse("1,2").Contains(null));
        }

        [Fact]
        public void Contains_BooleanText_IgnoresCase()
        {
            Assert.True(CodeList.Parse("true").Contains("True"));
        }
    }

    public class TriggerMatcherTests
    {
        private static SurveyTrigger EventTrigger(string statuses, string types = null) => new SurveyTrigger
        {
            Kind = TriggerKind.Event, StatusValues = CodeList.Parse(statuses), TypeValues = CodeList.Parse(types),
        };

        private static RecordChange Update(string oldStatus, string newStatus, string type = "1") =>
            new RecordChange { Message = ChangeMessage.Update, OldStatus = oldStatus, NewStatus = newStatus, Type = type };

        [Fact]
        public void Matches_EventStatusEntersSet_Fires()
        {
            Assert.True(TriggerMatcher.Matches(EventTrigger("5,6"), Update("1", "5")));
        }

        [Fact]
        public void Matches_EventStatusMovesInsideSet_DoesNotFire()
        {
            Assert.False(TriggerMatcher.Matches(EventTrigger("5,6"), Update("5", "6")));
        }

        [Fact]
        public void Matches_EventStatusUnchanged_DoesNotFire()
        {
            Assert.False(TriggerMatcher.Matches(EventTrigger("5"), Update("5", "5")));
        }

        [Fact]
        public void Matches_EventStatusLeavesSet_DoesNotFire()
        {
            Assert.False(TriggerMatcher.Matches(EventTrigger("5"), Update("5", "1")));
        }

        [Fact]
        public void Matches_EventOnCreate_DoesNotFire()
        {
            var create = new RecordChange { Message = ChangeMessage.Create, NewStatus = "5" };

            Assert.False(TriggerMatcher.Matches(EventTrigger("5"), create));
        }

        [Fact]
        public void Matches_TypeNotInFilter_DoesNotFire()
        {
            Assert.False(TriggerMatcher.Matches(EventTrigger("5", types: "100000001"), Update("1", "5", type: "100000002")));
        }

        [Fact]
        public void Matches_CreatedWithoutStatusFilter_FiresOnCreate()
        {
            var trigger = new SurveyTrigger { Kind = TriggerKind.Created };

            Assert.True(TriggerMatcher.Matches(trigger, new RecordChange { Message = ChangeMessage.Create, NewStatus = "1" }));
        }

        [Fact]
        public void Matches_CreatedWithStatusFilter_FiresOnlyForThoseStatuses()
        {
            var trigger = new SurveyTrigger { Kind = TriggerKind.Created, StatusValues = CodeList.Parse("2") };

            Assert.False(TriggerMatcher.Matches(trigger, new RecordChange { Message = ChangeMessage.Create, NewStatus = "1" }));
        }

        [Fact]
        public void Matches_ScheduledKind_NeverFiresFromARecordChange()
        {
            var trigger = new SurveyTrigger { Kind = TriggerKind.Scheduled, StatusValues = CodeList.Parse("5") };

            Assert.False(TriggerMatcher.Matches(trigger, Update("1", "5")));
        }
    }

    public class ChannelResolverTests
    {
        private static readonly SurveySetup Setup = new SurveySetup { DeliveryDigital = DeliveryChoice.Portal, DeliveryLegacy = DeliveryChoice.None };

        private static SurveySource Source(string originField) =>
            new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { Origin = originField, DigitalOriginValues = CodeList.Parse("751090002") });

        [Fact]
        public void Resolve_DigitalOrigin_UsesDigitalDelivery()
        {
            Assert.Equal(DeliveryChoice.Portal, ChannelResolver.Resolve(Source("qdb_source_location"), Setup, new RecordChange { Origin = "751090002" }));
        }

        [Fact]
        public void Resolve_OtherOrigin_UsesLegacyDelivery()
        {
            Assert.Equal(DeliveryChoice.None, ChannelResolver.Resolve(Source("qdb_source_location"), Setup, new RecordChange { Origin = "751090000" }));
        }

        [Fact]
        public void Resolve_EmptyOrigin_IsLegacy()
        {
            Assert.Equal(DeliveryChoice.None, ChannelResolver.Resolve(Source("qdb_source_location"), Setup, new RecordChange { Origin = null }));
        }

        [Fact]
        public void Resolve_SourceWithoutOriginField_TreatsEveryRequestAsDigital()
        {
            Assert.Equal(DeliveryChoice.Portal, ChannelResolver.Resolve(Source(null), Setup, new RecordChange { Origin = "751090000" }));
        }
    }

    public class ActiveWindowTests
    {
        private static readonly DateTime Today = new DateTime(2026, 11, 10, 15, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void IsOpen_NoLimits_IsOpen()
        {
            Assert.True(ActiveWindow.IsOpen(new SurveySetup(), Today));
        }

        [Fact]
        public void IsOpen_LastDayIsToday_IsOpen()
        {
            Assert.True(ActiveWindow.IsOpen(new SurveySetup { ActiveTo = new DateTime(2026, 11, 10) }, Today));
        }

        [Fact]
        public void IsOpen_StartsTomorrow_IsClosed()
        {
            Assert.False(ActiveWindow.IsOpen(new SurveySetup { ActiveFrom = new DateTime(2026, 11, 11) }, Today));
        }

        [Fact]
        public void IsOpen_EndedYesterday_IsClosed()
        {
            Assert.False(ActiveWindow.IsOpen(new SurveySetup { ActiveTo = new DateTime(2026, 11, 9) }, Today));
        }
    }

    public class DedupeKeyTests
    {
        private static readonly Guid SetupId = new Guid("11111111-1111-1111-1111-111111111111");
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");
        private static readonly Guid RecordId = new Guid("33333333-3333-3333-3333-333333333333");

        [Fact]
        public void ForRecord_NormalTable_IsReadable()
        {
            var change = new RecordChange { TableLogicalName = "qdb_cheque_clearing", RecordId = RecordId };

            Assert.Equal("11111111-1111-1111-1111-111111111111|22222222-2222-2222-2222-222222222222|qdb_cheque_clearing:33333333-3333-3333-3333-333333333333",
                DedupeKey.ForRecord(SetupId, CustomerId, change));
        }

        [Fact]
        public void ForRecord_VeryLongTableName_IsHashedToFitTheColumn()
        {
            var change = new RecordChange { TableLogicalName = "qdb_" + new string('x', 120), RecordId = RecordId };

            var key = DedupeKey.ForRecord(SetupId, CustomerId, change);

            Assert.True(key.StartsWith("sha256:") && key.Length <= DedupeKey.MaxLength);
        }
    }

    public class LanguageCodeTests
    {
        [Theory]
        [InlineData("ar", "ar")]
        [InlineData("ar-QA", "ar")]
        [InlineData("Arabic", "ar")]
        [InlineData(1025, "ar")]
        [InlineData("1033", "en")]
        [InlineData("English", "en")]
        [InlineData("fr", "en")]
        [InlineData(null, "en")]
        public void Normalise_StoredValue_MapsToRenderCacheLanguage(object stored, string expected)
        {
            Assert.Equal(expected, LanguageCode.Normalise(stored, "en"));
        }
    }
}

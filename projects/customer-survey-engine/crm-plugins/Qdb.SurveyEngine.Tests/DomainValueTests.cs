using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    // ── CustomerLinkReader and Reference extension ────────────────────────────

    public class CustomerLinkExtensionTests
    {
        [Fact]
        public void Reference_AccountLink_ReturnsAccountEntityReference()
        {
            var customerId = Guid.NewGuid();

            var reference = CustomerLink.Account.Reference(customerId);

            Assert.Equal("account", reference.LogicalName);
            Assert.Equal(customerId, reference.Id);
        }

        [Fact]
        public void Reference_ContactLink_ReturnsContactEntityReference()
        {
            var customerId = Guid.NewGuid();

            var reference = CustomerLink.Contact.Reference(customerId);

            Assert.Equal("contact", reference.LogicalName);
            Assert.Equal(customerId, reference.Id);
        }

        [Fact]
        public void CustomerIdOf_AccountLink_ReturnsIdFromAccountLookup()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation") { [CustomerLink.Account.LookupColumn] = new EntityReference("account", id) };

            Assert.Equal(id, CustomerLink.Account.CustomerIdOf(row));
        }

        [Fact]
        public void CustomerIdOf_ContactLink_ReadsContactLookupNotAccountLookup()
        {
            var contactId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation")
            {
                [CustomerLink.Account.LookupColumn] = new EntityReference("account", Guid.NewGuid()),
                [CustomerLink.Contact.LookupColumn] = new EntityReference("contact", contactId),
            };

            Assert.Equal(contactId, CustomerLink.Contact.CustomerIdOf(row));
        }
    }

    // ── WeightedScoring ResponseScore boundary ────────────────────────────────

    public class ResponseScoreBoundaryTests
    {
        [Fact]
        public void Percent_ZeroMaximum_IsNull()
        {
            var score = new ResponseScore(0m, 0m);

            Assert.Null(score.Percent);
        }

        [Fact]
        public void Percent_NonZeroMaximum_IsRoundedToTwoDecimals()
        {
            var score = new ResponseScore(1m, 3m); // 33.333...%

            Assert.Equal(33.33m, score.Percent.Value);
        }

        [Fact]
        public void Of_AllSkippedAnswers_ProducesZeroTotalAndMaximum()
        {
            // Skipped answers have no Score set
            var answers = new[] { new AnswerRow { AnswerText = "skipped" } };

            var score = ResponseScore.Of(answers);

            Assert.Equal(0m, score.Total);
            Assert.Equal(0m, score.Maximum);
        }
    }

    // ── Null-guard constructor tests (covers the throw branch of ?? throw) ─────

    public class NullConstructorGuardTests
    {
        [Fact]
        public void InvitationKey_NullDedupeKeyFirstCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey(null, (int?)null));
        }

        [Fact]
        public void InvitationKey_NullDedupeKeySecondCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey(null, new ScheduledSlot("k", null)));
        }

        [Fact]
        public void InvitationKey_NullSlotSecondCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey("k", (ScheduledSlot)null));
        }

        [Fact]
        public void ScheduledSlot_NullPeriodKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledSlot(null, null));
        }

        [Fact]
        public void InvitationPlan_NullKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationPlan(DeliveryChoice.Portal, null, "en"));
        }

        [Fact]
        public void SuppressionRecorder_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SuppressionRecorder(null));
        }

        [Fact]
        public void ScheduledRun_NullTrigger_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledRun(null, new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc), new SurveySettings()));
        }

        [Fact]
        public void ScheduledRun_NullSettings_Throws()
        {
            var trigger = new SurveyTrigger
            {
                Setup = new SurveySetup(),
                Schedule = new ScheduleSettings { Period = SchedulePeriod.Monthly },
            };
            Assert.Throws<ArgumentNullException>(() => new ScheduledRun(trigger, new DateTime(2026, 2, 1), null));
        }

        [Fact]
        public void ReviewedPeriod_NullKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ReviewedPeriod(new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 1, 16, 0, 0, 0, DateTimeKind.Utc), null));
        }

        [Fact]
        public void SurveySource_NullTableLogicalName_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveySource(Guid.NewGuid(), null, new SourceFields()));
        }

        [Fact]
        public void SurveySource_NullFields_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveySource(Guid.NewGuid(), "contact", null));
        }

        [Fact]
        public void RunBudget_NullClock_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new RunBudget(null, TimeSpan.FromMinutes(1)));
        }

        [Fact]
        public void TracingServiceTrace_NullTracing_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new TracingServiceTrace(null));
        }

        [Fact]
        public void SurveyApiException_NullCode_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveyApiException(null, "detail"));
        }

        [Fact]
        public void PostponedInvitationStore_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new PostponedInvitationStore(null, CustomerLink.Account));
        }

        [Fact]
        public void PostponedInvitationStore_NullCustomer_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new PostponedInvitationStore(new Mock<IOrganizationService>().Object, null));
        }

        [Fact]
        public void ScheduledTriggerRepository_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledTriggerRepository(null));
        }

        [Fact]
        public void RunDueSurveysService_NullPostponed_Throws()
        {
            // Passes null for all three concrete-class parameters; throws on the first null guard
            Assert.Throws<ArgumentNullException>(() => new RunDueSurveysService(null, null, null));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => RunDueSurveysService.Compose(null));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullPipeline_Throws()
        {
            var deps = new RunDueSurveysDependencies { Pipeline = null };
            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullScheduledTriggers_Throws()
        {
            // Pipeline is populated but ScheduledTriggers is null
            var pipeline = ValidPipeline();
            var deps = new RunDueSurveysDependencies
            {
                Pipeline = pipeline,
                ScheduledTriggers = null,
                Population = new Mock<ICustomerPopulationReader>().Object,
                ScheduledInvitations = new Mock<IScheduledInvitationReader>().Object,
                Postponed = new Mock<IPostponedInvitationStore>().Object,
                Retention = new Mock<IResponseRetentionStore>().Object,
            };
            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }

        private static SurveyTriggerDependencies ValidPipeline()
        {
            var service = new Mock<IOrganizationService>().Object;
            var customer = CustomerLink.Account;
            return new SurveyTriggerDependencies
            {
                Config = new SurveyConfigRepository(service),
                Languages = new CustomerLanguageReader(service, customer),
                RenderCache = new RenderCacheReader(service),
                Invitations = new InvitationRepository(service, customer),
                Suppressions = new SuppressionLogWriter(service, customer),
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(new Mock<ITracingService>().Object),
            };
        }
    }

    // ── JsonText edge cases ───────────────────────────────────────────────────

    public class JsonTextEdgeCaseTests
    {
        [Fact]
        public void Write_NullValue_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => JsonText.Write(null));
        }

        [Fact]
        public void Read_InvalidJson_ThrowsSurveyApiException()
        {
            Assert.Throws<SurveyApiException>(() => JsonText.Read<Dictionary<string, string>>("{not valid json!!", "Test"));
        }

        [Fact]
        public void Read_NullJson_CoercesToEmptyStringAndThrowsSurveyApiException()
        {
            // Covers the null-coalescing branch: json ?? string.Empty; then empty string fails deserialization.
            Assert.Throws<SurveyApiException>(() => JsonText.Read<string>(null, "Test"));
        }

        [Fact]
        public void Read_ValidJson_DeserializesCorrectly()
        {
            var result = JsonText.Read<Dictionary<string, string>>("{\"key\":\"value\"}", "Test");
            Assert.Equal("value", result["key"]);
        }
    }

    // ── LinkToken edge cases ──────────────────────────────────────────────────

    public class LinkTokenHashEdgeCaseTests
    {
        [Fact]
        public void Hash_NullToken_ThrowsArgumentException()
        {
            Assert.Throws<ArgumentException>(() => LinkToken.Hash(null));
        }

        [Fact]
        public void Hash_WhitespaceToken_ThrowsArgumentException()
        {
            Assert.Throws<ArgumentException>(() => LinkToken.Hash("   "));
        }

        [Fact]
        public void Hash_ValidToken_ReturnsLowercaseHex()
        {
            var token = LinkToken.Generate();
            var hash = LinkToken.Hash(token);

            Assert.Equal(64, hash.Length);
            Assert.True(hash == hash.ToLowerInvariant());
        }
    }

    // ── RunSummary.IsComplete false path ──────────────────────────────────────

    public class RunSummaryIsCompleteTests
    {
        [Fact]
        public void IsComplete_WhenPostponedPassIsIncomplete_ReturnsFalse()
        {
            var postponed = new PostponedReleaseResult { IsComplete = false };
            var scheduled = new ScheduledRunResult { IsComplete = true };
            var retention = new RetentionResult { IsComplete = true };
            var summary = new RunSummary(postponed, scheduled, retention);

            Assert.False(summary.IsComplete);
        }

        [Fact]
        public void IsComplete_WhenAllPassesComplete_ReturnsTrue()
        {
            var summary = new RunSummary(
                new PostponedReleaseResult { IsComplete = true },
                new ScheduledRunResult { IsComplete = true },
                new RetentionResult { IsComplete = true });

            Assert.True(summary.IsComplete);
        }

        [Fact]
        public void ToString_WhenNotComplete_IncludesTimeBudgetMessage()
        {
            var postponed = new PostponedReleaseResult { IsComplete = false };
            var scheduled = new ScheduledRunResult { IsComplete = true };
            var retention = new RetentionResult { IsComplete = true };
            var summary = new RunSummary(postponed, scheduled, retention);

            Assert.Contains("Time budget spent", summary.ToString());
        }
    }

    // ── RunBudget.IsExhausted coverage (both branches) ───────────────────────

    public class RunBudgetExhaustedTests
    {
        [Fact]
        public void IsExhausted_WhenClockIsBeforeDeadline_ReturnsFalse()
        {
            var clock = new Mock<IClock>();
            clock.SetupGet(c => c.UtcNow).Returns(new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc));
            var budget = new RunBudget(clock.Object, TimeSpan.FromHours(1));

            Assert.False(budget.IsExhausted);
        }

        [Fact]
        public void IsExhausted_WhenClockIsAtOrAfterDeadline_ReturnsTrue()
        {
            var baseline = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
            var clock = new Mock<IClock>();
            clock.SetupSequence(c => c.UtcNow)
                 .Returns(baseline)
                 .Returns(baseline.AddMinutes(1));

            var budget = new RunBudget(clock.Object, TimeSpan.FromSeconds(30));

            Assert.True(budget.IsExhausted);
        }
    }
}

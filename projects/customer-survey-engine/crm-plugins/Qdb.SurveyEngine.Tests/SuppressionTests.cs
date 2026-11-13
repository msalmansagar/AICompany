using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class SuppressionRecorderExceptionTests
    {
        private const string Table = "qdb_cheque_clearing";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");

        private static TriggerEvaluation Evaluation()
        {
            var source = new SurveySource(Guid.NewGuid(), Table, new SourceFields());
            var trigger = new SurveyTrigger { Id = Guid.NewGuid(), Setup = new SurveySetup { Id = Guid.NewGuid() } };
            var change = new RecordChange { CustomerId = CustomerId, TableLogicalName = Table };
            return new TriggerEvaluation(trigger, source, change);
        }

        /// <summary>
        /// NFR-CSE-001: the suppression log exists for auditability. When the write throws, the
        /// exception must propagate — silently swallowing it would create an invisible gap in the audit trail.
        /// </summary>
        [Fact]
        public void Record_SuppressionLogThrows_PropagatesTheException()
        {
            var store = new InMemorySurveyStore();
            var deps = store.AsDependencies();
            deps.Suppressions = new ThrowingSuppressionLog();
            var recorder = new SuppressionRecorder(deps);

            Assert.Throws<InvalidOperationException>(() =>
                recorder.Record(Evaluation(), SuppressionReason.FormNotPublished, "test"));
        }

        [Fact]
        public void Record_Succeeds_WritesEntryWithAllFields()
        {
            var store = new InMemorySurveyStore();
            var evaluation = Evaluation();
            new SuppressionRecorder(store.AsDependencies())
                .Record(evaluation, SuppressionReason.Fatigue, "test detail");

            var entry = store.Suppressions.Single();
            Assert.Equal(SuppressionReason.Fatigue, entry.Reason);
            Assert.Equal(CustomerId, entry.CustomerId);
            Assert.Equal(evaluation.Trigger.Id, entry.TriggerId);
            Assert.Equal(evaluation.Trigger.Setup.Id, entry.SetupId);
        }

        [Fact]
        public void Record_Succeeds_TracesTheSuppression()
        {
            var store = new InMemorySurveyStore();
            new SuppressionRecorder(store.AsDependencies())
                .Record(Evaluation(), SuppressionReason.Fatigue, "some reason");

            Assert.Contains(store.TraceLines, t => t.Contains("Fatigue") && t.Contains("some reason"));
        }

        private sealed class ThrowingSuppressionLog : ISuppressionLog
        {
            public void Write(SuppressionEntry entry) => throw new InvalidOperationException("Storage unavailable");
        }
    }

    // ── SuppressionLogWriter ──────────────────────────────────────────────────

    public class SuppressionLogWriterTests
    {
        [Fact]
        public void Write_WithCustomerId_SetsCustomerLookup()
        {
            var customerId = Guid.NewGuid();
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, CustomerId = customerId, SetupId = Guid.NewGuid(),
                LoggedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
            });

            Assert.True(written.Contains(CustomerLink.Account.LookupColumn));
        }

        [Fact]
        public void Write_NullCustomerId_DoesNotSetCustomerLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, CustomerId = null, SetupId = Guid.NewGuid(),
                LoggedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
            });

            Assert.False(written.Contains(CustomerLink.Account.LookupColumn));
        }

        [Fact]
        public void Write_EmptyTriggerId_OmitsTriggerLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, SetupId = Guid.NewGuid(), TriggerId = Guid.Empty,
                LoggedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
            });

            Assert.False(written.Contains("qdb_survey_trigger_id"));
        }

        [Fact]
        public void Write_NonEmptyTriggerId_SetsTriggerLookup()
        {
            var triggerId = Guid.NewGuid();
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, SetupId = Guid.NewGuid(), TriggerId = triggerId,
                LoggedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
            });

            Assert.Equal(triggerId, written.GetAttributeValue<EntityReference>("qdb_survey_trigger_id")?.Id);
        }
    }
}

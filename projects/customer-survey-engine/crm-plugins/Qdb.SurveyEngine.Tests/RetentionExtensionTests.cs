using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// RetentionPass three-step extension: responses → invitations → suppression logs (FR-CSE-076/077/078).
    /// Floor constants protect invitations (13 months) and suppression logs (12 months) from premature deletion.
    /// </summary>
    public class RetentionFloorTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _store;

        public RetentionFloorTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
            // All settings use delete mode so the response step does not block the invitation/suppression steps.
            _pipeline.Settings.RetentionDays = 365;
            _pipeline.Settings.RetentionMode = RetentionMode.Delete;
        }

        private void Run() =>
            RunDueSurveysService.Compose(_store.AsDependencies())
                .Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1)));

        // ── Invitation floor: 395 days ───────────────────────────────────────

        [Fact]
        public void RunInvitations_RetentionDaysBelowFloor_ProtectsInvitationsNewerThanFloor()
        {
            // retentionDays=90 < floor=395, so the effective cutoff is 395 days ago.
            _pipeline.Settings.RetentionDays = 90;
            var invitationId = Guid.NewGuid();
            // 200 days old — older than 90, but newer than 395.
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-200);

            Run();

            Assert.DoesNotContain(invitationId, _store.DeletedInvitations);
        }

        [Fact]
        public void RunInvitations_RetentionDaysBelowFloor_DeletesInvitationsOlderThanFloor()
        {
            _pipeline.Settings.RetentionDays = 90;
            var invitationId = Guid.NewGuid();
            // 400 days old — older than the 395-day floor.
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-400);

            Run();

            Assert.Contains(invitationId, _store.DeletedInvitations);
        }

        [Fact]
        public void RunInvitations_RetentionDaysAboveFloor_UsesRetentionDays()
        {
            // retentionDays=400 > floor=395, so the effective cutoff is 400 days ago.
            _pipeline.Settings.RetentionDays = 400;
            var invitationId = Guid.NewGuid();
            // 396 days old — older than 395 floor, but newer than the 400-day setting.
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-396);

            Run();

            // The effective cutoff is 400 days, so this invitation must NOT be deleted.
            Assert.DoesNotContain(invitationId, _store.DeletedInvitations);
        }

        [Fact]
        public void RunInvitations_RetentionDaysAboveFloor_DeletesInvitationsOlderThanSetting()
        {
            _pipeline.Settings.RetentionDays = 400;
            var invitationId = Guid.NewGuid();
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-405);

            Run();

            Assert.Contains(invitationId, _store.DeletedInvitations);
        }

        [Fact]
        public void InvitationFloorDays_IsThirteenMonthsInDays()
        {
            Assert.Equal(395, RetentionPass.InvitationFloorDays);
        }

        // ── Suppression log floor: 365 days ─────────────────────────────────

        [Fact]
        public void RunSuppressionLogs_RetentionDaysBelowFloor_ProtectsLogsNewerThanFloor()
        {
            _pipeline.Settings.RetentionDays = 90;
            var logId = Guid.NewGuid();
            // 200 days old — older than 90, but newer than 365.
            _store.SuppressionLogCreatedOn[logId] = _pipeline.UtcNow.AddDays(-200);

            Run();

            Assert.DoesNotContain(logId, _store.DeletedSuppressionLogs);
        }

        [Fact]
        public void RunSuppressionLogs_RetentionDaysBelowFloor_DeletesLogsOlderThanFloor()
        {
            _pipeline.Settings.RetentionDays = 90;
            var logId = Guid.NewGuid();
            _store.SuppressionLogCreatedOn[logId] = _pipeline.UtcNow.AddDays(-370);

            Run();

            Assert.Contains(logId, _store.DeletedSuppressionLogs);
        }

        [Fact]
        public void SuppressionLogFloorDays_IsTwelveMonthsInDays()
        {
            Assert.Equal(365, RetentionPass.SuppressionLogFloorDays);
        }
    }

    /// <summary>
    /// RetentionPass three-step execution: responses, then invitations, then suppression logs, all in one pass.
    /// </summary>
    public class RetentionThreeStepTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemorySchedulingStore _store;

        public RetentionThreeStepTests()
        {
            _store = new InMemorySchedulingStore(_pipeline);
            _pipeline.Settings.RetentionDays = 400;
            _pipeline.Settings.RetentionMode = RetentionMode.Delete;
        }

        private void Run() =>
            RunDueSurveysService.Compose(_store.AsDependencies())
                .Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1)));

        [Fact]
        public void Run_AllThreeSteps_ProcessesResponsesInvitationsAndSuppressionLogs()
        {
            var responseId = Guid.NewGuid();
            _store.Responses[responseId] = Tuple.Create(_pipeline.UtcNow.AddDays(-500), true);

            var invitationId = Guid.NewGuid();
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-500);

            var logId = Guid.NewGuid();
            _store.SuppressionLogCreatedOn[logId] = _pipeline.UtcNow.AddDays(-500);

            Run();

            Assert.Contains(responseId, _store.Deleted);
            Assert.Contains(invitationId, _store.DeletedInvitations);
            Assert.Contains(logId, _store.DeletedSuppressionLogs);
        }

        [Fact]
        public void Run_BudgetExhaustedBeforeFirstItem_ReturnsIsCompleteFalse()
        {
            // A zero-allowance budget is exhausted before the first item in every step.
            var responseId = Guid.NewGuid();
            _store.Responses[responseId] = Tuple.Create(_pipeline.UtcNow.AddDays(-500), true);

            var result = RunDueSurveysService.Compose(_store.AsDependencies())
                .Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.Zero));

            Assert.False(result.Retention.IsComplete);
        }

        [Fact]
        public void Run_NoData_IsComplete()
        {
            var result = RunDueSurveysService.Compose(_store.AsDependencies())
                .Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1)));

            Assert.True(result.Retention.IsComplete);
        }

        [Fact]
        public void Run_OutcomeMessage_MentionsAllThreeCounts()
        {
            var responseId = Guid.NewGuid();
            _store.Responses[responseId] = Tuple.Create(_pipeline.UtcNow.AddDays(-500), true);

            var invitationId = Guid.NewGuid();
            _store.InvitationGeneratedOn[invitationId] = _pipeline.UtcNow.AddDays(-500);

            var logId = Guid.NewGuid();
            _store.SuppressionLogCreatedOn[logId] = _pipeline.UtcNow.AddDays(-500);

            var result = RunDueSurveysService.Compose(_store.AsDependencies())
                .Run(_pipeline.UtcNow, new RunBudget(_pipeline, TimeSpan.FromMinutes(1)));

            Assert.Contains("response", result.Retention.Outcome);
            Assert.Contains("invitation", result.Retention.Outcome);
            Assert.Contains("suppression log", result.Retention.Outcome);
        }
    }

    // ── Data layer: InvitationRetentionStore ────────────────────────────────

    public class InvitationRetentionStoreDataTests
    {
        private static readonly DateTime Cutoff = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc);
        private static readonly Guid OldId = new Guid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        private static readonly Guid NewId = new Guid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

        [Fact]
        public void FindGeneratedBefore_ReturnsOnlyOlderInvitations()
        {
            var oldEntity = new Entity("qdb_survey_invitation", OldId);
            oldEntity["qdb_generated_on"] = Cutoff.AddDays(-1);
            var newEntity = new Entity("qdb_survey_invitation", NewId);
            newEntity["qdb_generated_on"] = Cutoff.AddDays(1);

            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { oldEntity }) { MoreRecords = false });

            var ids = new InvitationRetentionStore(service.Object)
                .FindGeneratedBefore(Cutoff);

            Assert.Equal(new[] { OldId }, ids.ToArray());
        }

        [Fact]
        public void FindGeneratedBefore_QueriesOnGeneratedOnColumn()
        {
            QueryExpression captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Callback<QueryBase>(q => captured = (QueryExpression)q)
                   .Returns(new EntityCollection() { MoreRecords = false });

            new InvitationRetentionStore(service.Object).FindGeneratedBefore(Cutoff);

            Assert.Equal("qdb_survey_invitation", captured.EntityName);
            Assert.Contains(
                captured.Criteria.Conditions,
                c => c.AttributeName == "qdb_generated_on" && c.Operator == ConditionOperator.LessThan);
        }

        [Fact]
        public void Delete_CallsServiceDeleteOnTheSurveyInvitationEntity()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(s => s.Delete("qdb_survey_invitation", OldId));

            new InvitationRetentionStore(service.Object).Delete(OldId);

            service.Verify(s => s.Delete("qdb_survey_invitation", OldId), Times.Once());
        }
    }

    // ── Data layer: SuppressionLogRetentionStore ─────────────────────────────

    public class SuppressionLogRetentionStoreDataTests
    {
        private static readonly DateTime Cutoff = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc);
        private static readonly Guid OldId = new Guid("cccccccc-cccc-cccc-cccc-cccccccccccc");

        [Fact]
        public void FindCreatedBefore_ReturnsOnlyOlderLogs()
        {
            var oldEntity = new Entity("qdb_survey_suppression_log", OldId);

            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { oldEntity }) { MoreRecords = false });

            var ids = new SuppressionLogRetentionStore(service.Object)
                .FindCreatedBefore(Cutoff);

            Assert.Equal(new[] { OldId }, ids.ToArray());
        }

        [Fact]
        public void FindCreatedBefore_QueriesOnCreatedOnColumn()
        {
            QueryExpression captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Callback<QueryBase>(q => captured = (QueryExpression)q)
                   .Returns(new EntityCollection() { MoreRecords = false });

            new SuppressionLogRetentionStore(service.Object).FindCreatedBefore(Cutoff);

            Assert.Equal("qdb_survey_suppression_log", captured.EntityName);
            Assert.Contains(
                captured.Criteria.Conditions,
                c => c.AttributeName == "createdon" && c.Operator == ConditionOperator.LessThan);
        }

        [Fact]
        public void Delete_CallsServiceDeleteOnTheSurveySuppressionLogEntity()
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(s => s.Delete("qdb_survey_suppression_log", OldId));

            new SuppressionLogRetentionStore(service.Object).Delete(OldId);

            service.Verify(s => s.Delete("qdb_survey_suppression_log", OldId), Times.Once());
        }
    }

    // ── Validation: RunDueSurveysService.Compose null-checks ─────────────────

    public class RunDueSurveysServiceCompositionTests
    {
        [Fact]
        public void Compose_NullInvitationRetention_Throws()
        {
            var store = new InMemorySchedulingStore(new InMemorySurveyStore());
            var deps = store.AsDependencies();
            deps.InvitationRetention = null;

            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }

        [Fact]
        public void Compose_NullSuppressionLogRetention_Throws()
        {
            var store = new InMemorySchedulingStore(new InMemorySurveyStore());
            var deps = store.AsDependencies();
            deps.SuppressionLogRetention = null;

            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }
    }
}

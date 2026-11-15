using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Erasure;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// CustomerErasureService: dry-run, delete mode, anonymise mode, two-write audit pattern,
    /// budget exhaustion, idempotent reruns, and cross-org safety
    /// (NFR-CSE-012/013/014, FR-CSE-081, C.3.4/ADR-008 R2, SEC-001/002/003).
    /// </summary>
    public class CustomerErasureServiceTests
    {
        private static readonly Guid CustomerId = new Guid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        private static readonly Guid UserId = new Guid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        private static readonly Guid InvId1 = new Guid("11111111-1111-1111-1111-111111111111");
        private static readonly Guid InvId2 = new Guid("22222222-2222-2222-2222-222222222222");
        private static readonly Guid RespId1 = new Guid("33333333-3333-3333-3333-333333333333");
        private static readonly Guid RespId2 = new Guid("44444444-4444-4444-4444-444444444444");
        private static readonly Guid AnsId1 = new Guid("55555555-5555-5555-5555-555555555555");
        private static readonly Guid SupLogId1 = new Guid("66666666-6666-6666-6666-666666666666");

        private static readonly DateTime FixedUtcNow = new DateTime(2026, 11, 15, 10, 0, 0, DateTimeKind.Utc);

        /// <summary>A clock whose UtcNow never advances — the ample budget never exhausts.</summary>
        private static Mock<IClock> AmpleClock()
        {
            var clock = new Mock<IClock>();
            clock.Setup(c => c.UtcNow).Returns(FixedUtcNow);
            return clock;
        }

        /// <summary>A clock that returns DateTime.MaxValue — any budget created from it is immediately exhausted.</summary>
        private static Mock<IClock> ExhaustedClock()
        {
            var clock = new Mock<IClock>();
            clock.Setup(c => c.UtcNow).Returns(DateTime.MaxValue);
            return clock;
        }

        private static RunBudget AmpleBudget(Mock<IClock> clock) => new RunBudget(clock.Object, TimeSpan.FromMinutes(1));
        private static RunBudget ExhaustedBudget(Mock<IClock> clock) => new RunBudget(clock.Object, TimeSpan.Zero);

        private static Mock<ICustomerSurveyDataRepository> RepoWithData(
            IReadOnlyList<Guid> invitations = null,
            IReadOnlyList<Guid> responses = null,
            IReadOnlyList<Guid> answers = null,
            IReadOnlyList<Guid> suppressionLogs = null,
            IReadOnlyList<Guid> residualResponses = null)
        {
            var repo = new Mock<ICustomerSurveyDataRepository>();
            repo.Setup(r => r.FindInvitations(It.IsAny<Guid>())).Returns(invitations ?? new List<Guid>());
            repo.Setup(r => r.FindResponses(It.IsAny<Guid>())).Returns(responses ?? new List<Guid>());
            repo.Setup(r => r.FindAnswers(It.IsAny<IReadOnlyList<Guid>>())).Returns(answers ?? new List<Guid>());
            repo.Setup(r => r.FindSuppressionLogs(It.IsAny<Guid>())).Returns(suppressionLogs ?? new List<Guid>());
            repo.Setup(r => r.FindResidualResponses(It.IsAny<Guid>())).Returns(residualResponses ?? new List<Guid>());
            return repo;
        }

        private static Mock<IResponseRetentionStore> ResponseStore() => new Mock<IResponseRetentionStore>();
        private static Mock<IErasureTraceWriter> ErasureLog() => new Mock<IErasureTraceWriter>();

        private static CustomerErasureService Build(
            Mock<ICustomerSurveyDataRepository> repo,
            Mock<IResponseRetentionStore> responseStore,
            Mock<IClock> clock,
            Mock<IErasureTraceWriter> erasureLog) =>
            new CustomerErasureService(new CustomerErasureDependencies
            {
                Repo = repo.Object,
                ResponseStore = responseStore.Object,
                Clock = clock.Object,
                ErasureLog = erasureLog.Object,
            });

        private static ErasureRequest DeleteRequest(bool dryRun = false) => new ErasureRequest
        {
            CustomerId = CustomerId, InitiatingUserId = UserId, Mode = ErasureMode.Delete, DryRun = dryRun,
        };

        private static ErasureRequest AnonymiseRequest(bool dryRun = false) => new ErasureRequest
        {
            CustomerId = CustomerId, InitiatingUserId = UserId, Mode = ErasureMode.Anonymise, DryRun = dryRun,
        };

        // ── Dry-run (SEC-002) ────────────────────────────────────────────────

        [Fact]
        public void Erase_DryRun_ReturnsFoundCounts_WithAreActualFalse()
        {
            var repo = RepoWithData(
                invitations: new[] { InvId1, InvId2 },
                responses: new[] { RespId1 },
                answers: new[] { AnsId1 },
                suppressionLogs: new[] { SupLogId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(dryRun: true), AmpleBudget(clock));

            Assert.Equal(2, counts.InvitationCount);
            Assert.Equal(1, counts.ResponseCount);
            Assert.Equal(1, counts.AnswerCount);
            Assert.Equal(1, counts.SuppressionLogCount);
            Assert.False(counts.AreActual);
            Assert.True(counts.IsComplete);
        }

        [Fact]
        public void Erase_DryRun_MutatesNothingButWritesOneLogRow()
        {
            // SEC-002: dry-run writes a log row (DryRun=true, AreActual=false) but no data writes.
            var repo = RepoWithData(invitations: new[] { InvId1 }, suppressionLogs: new[] { SupLogId1 });
            var responseStore = ResponseStore();
            var erasureLog = ErasureLog();
            var clock = AmpleClock();
            var service = Build(repo, responseStore, clock, erasureLog);

            service.Erase(DeleteRequest(dryRun: true), AmpleBudget(clock));

            repo.Verify(r => r.DeleteInvitation(It.IsAny<Guid>()), Times.Never());
            repo.Verify(r => r.DeleteSuppressionLog(It.IsAny<Guid>()), Times.Never());
            responseStore.Verify(r => r.Anonymise(It.IsAny<Guid>()), Times.Never());
            erasureLog.Verify(w => w.Write(It.IsAny<ErasureRecord>()), Times.Once());
        }

        [Fact]
        public void Erase_DryRun_LogRowHasDryRunTrueAndAreActualFalse()
        {
            var repo = RepoWithData(invitations: new[] { InvId1, InvId2 });
            ErasureRecord written = null;
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => written = r);
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(dryRun: true), AmpleBudget(clock));

            Assert.True(written.DryRun);
            Assert.False(written.AreActual);
            Assert.Equal(2, written.InvitationCount);
        }

        // ── Delete mode ──────────────────────────────────────────────────────

        [Fact]
        public void Erase_DeleteMode_DeletesEachInvitation()
        {
            var repo = RepoWithData(invitations: new[] { InvId1, InvId2 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            repo.Verify(r => r.DeleteInvitation(InvId1), Times.Once());
            repo.Verify(r => r.DeleteInvitation(InvId2), Times.Once());
        }

        [Fact]
        public void Erase_DeleteMode_DeletesResidualResponsesAfterInvitations()
        {
            var residualId = Guid.NewGuid();
            var repo = RepoWithData(residualResponses: new[] { residualId });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            repo.Verify(r => r.DeleteResponse(residualId), Times.Once());
        }

        [Fact]
        public void Erase_DeleteMode_BudgetExhaustedDuringResiduals_IsCompleteFalse()
        {
            // No invitations (empty list → BudgetedDeletion returns isComplete=true even with zero budget).
            // One residual response → budget is exhausted when that step runs.
            var residualId = Guid.NewGuid();
            var repo = RepoWithData(residualResponses: new[] { residualId });
            var clock = ExhaustedClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(), ExhaustedBudget(clock));

            Assert.False(counts.IsComplete);
            repo.Verify(r => r.DeleteResponse(residualId), Times.Never());
        }

        [Fact]
        public void Erase_DeleteMode_DeletesSuppressionLogs()
        {
            var repo = RepoWithData(suppressionLogs: new[] { SupLogId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            repo.Verify(r => r.DeleteSuppressionLog(SupLogId1), Times.Once());
        }

        [Fact]
        public void Erase_DeleteMode_ReturnsAreActualTrue()
        {
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.True(counts.AreActual);
        }

        [Fact]
        public void Erase_DeleteMode_IsCompleteTrue_WhenAllDataErased()
        {
            var repo = RepoWithData(invitations: new[] { InvId1 }, suppressionLogs: new[] { SupLogId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.True(counts.IsComplete);
        }

        // ── Anonymise mode (ADR-008 R2: responses BEFORE invitations) ────────

        [Fact]
        public void Erase_AnonymiseMode_AnonymisesResponsesBeforeDeletingInvitations()
        {
            var ops = new List<string>();
            var repo = RepoWithData(invitations: new[] { InvId1 }, responses: new[] { RespId1 });
            repo.Setup(r => r.DeleteInvitation(It.IsAny<Guid>())).Callback<Guid>(id => ops.Add("delete-inv"));
            var responseStore = new Mock<IResponseRetentionStore>();
            responseStore.Setup(r => r.Anonymise(It.IsAny<Guid>())).Callback<Guid>(id => ops.Add("anonymise-resp"));
            var clock = AmpleClock();
            var service = Build(repo, responseStore, clock, ErasureLog());

            service.Erase(AnonymiseRequest(), AmpleBudget(clock));

            var anonymiseIndex = ops.IndexOf("anonymise-resp");
            var deleteInvIndex = ops.IndexOf("delete-inv");
            Assert.True(anonymiseIndex >= 0, "Anonymise must have been called.");
            Assert.True(deleteInvIndex >= 0, "DeleteInvitation must have been called.");
            // Anonymise must precede DeleteInvitation (C.3.4 / ADR-008 R2).
            Assert.True(anonymiseIndex < deleteInvIndex, "Responses must be anonymised before invitations are deleted.");
        }

        [Fact]
        public void Erase_AnonymiseMode_DeletesSuppressionLogsAfterInvitations()
        {
            var repo = RepoWithData(suppressionLogs: new[] { SupLogId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(AnonymiseRequest(), AmpleBudget(clock));

            repo.Verify(r => r.DeleteSuppressionLog(SupLogId1), Times.Once());
            Assert.True(counts.IsComplete);
        }

        [Fact]
        public void Erase_AnonymiseMode_DoesNotDeleteResponses()
        {
            var repo = RepoWithData(responses: new[] { RespId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            service.Erase(AnonymiseRequest(), AmpleBudget(clock));

            // Responses are anonymised, not deleted directly.
            repo.Verify(r => r.DeleteResponse(It.IsAny<Guid>()), Times.Never());
        }

        // ── Unknown customer → empty result ─────────────────────────────────

        [Fact]
        public void Erase_UnknownCustomer_ReturnsZerosAndIsComplete()
        {
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.Equal(0, counts.InvitationCount);
            Assert.Equal(0, counts.ResponseCount);
            Assert.Equal(0, counts.AnswerCount);
            Assert.Equal(0, counts.SuppressionLogCount);
            Assert.True(counts.IsComplete);
        }

        // ── Cross-org safety (NFR-CSE-014) ───────────────────────────────────

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public void Erase_RepoReturnsNoData_ReturnsZerosAndIsComplete(bool dryRun)
        {
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(new ErasureRequest { CustomerId = Guid.NewGuid(), InitiatingUserId = UserId, Mode = ErasureMode.Delete, DryRun = dryRun }, AmpleBudget(clock));

            Assert.Equal(0, counts.InvitationCount);
            Assert.Equal(0, counts.ResponseCount);
            Assert.Equal(0, counts.AnswerCount);
            Assert.Equal(0, counts.SuppressionLogCount);
            Assert.True(counts.IsComplete);
        }

        // ── Budget exhaustion (NFR-CSE-012) ──────────────────────────────────

        [Fact]
        public void Erase_BudgetExhaustedBeforeFirstItem_IsCompleteFalse()
        {
            var repo = RepoWithData(invitations: new[] { InvId1, InvId2 }, suppressionLogs: new[] { SupLogId1 });
            var clock = ExhaustedClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            var counts = service.Erase(DeleteRequest(), ExhaustedBudget(clock));

            Assert.False(counts.IsComplete);
        }

        // ── Idempotent reruns ────────────────────────────────────────────────

        [Fact]
        public void Erase_Rerun_SecondCallReturnsZerosWhenDataAlreadyGone()
        {
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, ErasureLog());

            service.Erase(DeleteRequest(), AmpleBudget(clock));
            var second = service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.Equal(0, second.InvitationCount);
            Assert.Equal(0, second.SuppressionLogCount);
            Assert.True(second.IsComplete);
        }

        // ── Audit log — two-write pattern (SEC-001) ──────────────────────────

        [Fact]
        public void Erase_LiveRun_WritesTwoAuditRows()
        {
            var repo = RepoWithData();
            var erasureLog = ErasureLog();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            erasureLog.Verify(w => w.Write(It.IsAny<ErasureRecord>()), Times.Exactly(2));
        }

        [Fact]
        public void Erase_LiveRun_WritesStartedRowBeforeAnyMutation()
        {
            // SEC-001: the first log Write must precede any DeleteInvitation.
            var ops = new List<string>();
            var repo = RepoWithData(invitations: new[] { InvId1 });
            repo.Setup(r => r.DeleteInvitation(It.IsAny<Guid>())).Callback<Guid>(id => ops.Add("delete"));
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => ops.Add("log-write"));
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            var firstWrite = ops.IndexOf("log-write");
            var firstDelete = ops.IndexOf("delete");
            Assert.True(firstWrite >= 0 && firstDelete >= 0, "Both Write and Delete must have been called.");
            Assert.True(firstWrite < firstDelete, "Started log row must be written before first mutation.");
        }

        [Fact]
        public void Erase_LiveRun_StartedRowHasFoundCountsAndAreActualFalseAndIsCompleteFalse()
        {
            // SEC-001: "started" row carries the found counts, AreActual=false, IsComplete=false.
            var writes = new List<ErasureRecord>();
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => writes.Add(r));
            var repo = RepoWithData(invitations: new[] { InvId1 }, suppressionLogs: new[] { SupLogId1 });
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            var startedRow = writes[0];
            Assert.Equal(1, startedRow.InvitationCount);
            Assert.Equal(1, startedRow.SuppressionLogCount);
            Assert.False(startedRow.AreActual);
            Assert.False(startedRow.IsComplete);
        }

        [Fact]
        public void Erase_LiveRun_CompletedRowHasAreActualTrueAndIsCompleteTrue()
        {
            var writes = new List<ErasureRecord>();
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => writes.Add(r));
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            var completedRow = writes[1];
            Assert.True(completedRow.AreActual);
            Assert.True(completedRow.IsComplete);
        }

        [Fact]
        public void Erase_LiveRun_AuditRowsCarryRequestFields()
        {
            var writes = new List<ErasureRecord>();
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => writes.Add(r));
            var repo = RepoWithData();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.All(writes, row =>
            {
                Assert.Equal(CustomerId, row.CustomerId);
                Assert.Equal(UserId, row.InitiatingUserId);
                Assert.Equal(ErasureMode.Delete, row.Mode);
                Assert.False(row.DryRun);
            });
        }

        [Fact]
        public void Erase_StartedWriteFails_NoMutationsOccur()
        {
            // SEC-001: if the started-row write fails, the exception propagates and nothing is erased.
            var repo = RepoWithData(invitations: new[] { InvId1 }, suppressionLogs: new[] { SupLogId1 });
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Throws(new InvalidOperationException("log write failed"));
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            Assert.Throws<InvalidOperationException>(() => service.Erase(DeleteRequest(), AmpleBudget(clock)));

            repo.Verify(r => r.DeleteInvitation(It.IsAny<Guid>()), Times.Never());
            repo.Verify(r => r.DeleteSuppressionLog(It.IsAny<Guid>()), Times.Never());
        }

        // ── Null-guard ───────────────────────────────────────────────────────

        [Fact]
        public void Erase_NullRequest_Throws()
        {
            var clock = AmpleClock();
            var service = Build(RepoWithData(), ResponseStore(), clock, ErasureLog());
            Assert.Throws<ArgumentNullException>(() => service.Erase(null, AmpleBudget(clock)));
        }

        [Fact]
        public void Erase_NullBudget_Throws()
        {
            var service = Build(RepoWithData(), ResponseStore(), AmpleClock(), ErasureLog());
            Assert.Throws<ArgumentNullException>(() => service.Erase(DeleteRequest(), null));
        }

        [Fact]
        public void Constructor_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new CustomerErasureService(null));
        }
    }

    // ── ErasureLogWriter ─────────────────────────────────────────────────────

    public class ErasureLogWriterTests
    {
        private static ErasureRecord SampleRecord() => new ErasureRecord
        {
            InitiatingUserId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Mode = ErasureMode.Delete,
            DryRun = false,
            InvitationCount = 2,
            ResponseCount = 1,
            AnswerCount = 3,
            SuppressionLogCount = 1,
            AreActual = true,
            IsComplete = true,
            ExecutedOnUtc = new DateTime(2026, 11, 15, 12, 0, 0, DateTimeKind.Utc),
        };

        [Fact]
        public void Write_HappyPath_CreatesOneRow()
        {
            var service = new Mock<IOrganizationService>();
            new ErasureLogWriter(service.Object).Write(SampleRecord());
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == ErasureLogWriter.ErasureLogTable)), Times.Once());
        }

        [Fact]
        public void Write_OrgFault_Propagates()
        {
            // A failed write propagates — the erasure has no recorded evidence.
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(new OrganizationServiceFault()));

            var writer = new ErasureLogWriter(service.Object);

            Assert.Throws<System.ServiceModel.FaultException<OrganizationServiceFault>>(() => writer.Write(SampleRecord()));
        }

        [Fact]
        public void Write_HappyPath_KeepsCallerAndCustomerAsText()
        {
            var service = new Mock<IOrganizationService>();
            Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e);
            var record = SampleRecord();

            new ErasureLogWriter(service.Object).Write(record);

            Assert.Equal(record.InitiatingUserId.ToString("D"), written["qdb_caller_id"]);
            Assert.Equal(record.CustomerId.ToString("D"), written["qdb_customer_guid"]);
        }

        [Fact]
        public void Write_NullRecord_Throws()
        {
            var writer = new ErasureLogWriter(new Mock<IOrganizationService>().Object);
            Assert.Throws<ArgumentNullException>(() => writer.Write(null));
        }

        [Fact]
        public void ErasureLogTable_IsTheProvisionedTableName()
        {
            Assert.Equal("qdb_survey_erasure_log", ErasureLogWriter.ErasureLogTable);
        }
    }

    // ── EraseCustomerSurveyDataPlugin — SEC-003 access before validation ──────

    public class EraseCustomerSurveyDataPluginTests
    {
        /// <summary>
        /// Builds a minimal IServiceProvider mock with the given role-collection for the initiating user
        /// and the given input parameters. If inputParameters is null, the context returns an empty collection.
        /// </summary>
        private static IServiceProvider ProviderWith(
            Guid initiatingUserId,
            EntityCollection roleResult,
            ParameterCollection inputParameters = null)
        {
            var outputs = new ParameterCollection();
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InitiatingUserId).Returns(initiatingUserId);
            context.SetupGet(c => c.InputParameters).Returns(inputParameters ?? new ParameterCollection());
            context.SetupGet(c => c.OutputParameters).Returns(outputs);

            // IOrganizationService: returns the specified role collection for every RetrieveMultiple call,
            // and reads qdb_survey_settings for CustomerLinkReader.
            var orgService = new Mock<IOrganizationService>();
            orgService.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => IsRoleQuery(q)))).Returns(roleResult);
            var settingsEntity = new Entity("qdb_survey_settings", Guid.NewGuid());
            orgService.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => !IsRoleQuery(q))))
                      .Returns(new EntityCollection(new[] { settingsEntity }) { MoreRecords = false });

            var factory = new Mock<IOrganizationServiceFactory>();
            factory.Setup(f => f.CreateOrganizationService(null)).Returns(orgService.Object);

            var tracing = new Mock<ITracingService>();
            tracing.Setup(t => t.Trace(It.IsAny<string>(), It.IsAny<object[]>()));

            var provider = new Mock<IServiceProvider>();
            provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(p => p.GetService(typeof(ITracingService))).Returns(tracing.Object);
            provider.Setup(p => p.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
            return provider.Object;
        }

        private static bool IsRoleQuery(QueryBase q) =>
            q is QueryExpression qe && (qe.EntityName == "role" || qe.EntityName == "team");

        [Fact]
        public void Execute_UnauthorisedUser_ThrowsAccessDenied_EvenWhenParametersAreMissing()
        {
            // SEC-003: access check happens BEFORE input validation.
            // User has no roles → access denied; parameters are empty → would also fail validation.
            // The access-denied exception must be thrown, not the "DryRun is required" exception.
            var userId = Guid.NewGuid();
            var provider = ProviderWith(userId, new EntityCollection(), inputParameters: new ParameterCollection());

            var ex = Assert.Throws<InvalidPluginExecutionException>(() =>
                new EraseCustomerSurveyDataPlugin().Execute(provider));

            Assert.Contains(ErasureAccessCheck.SurveyDataOfficerRoleName, ex.Message);
        }
    }
}

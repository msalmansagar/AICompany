using System;
using System.Collections.Generic;
using System.Linq;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Erasure;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// CustomerErasureService: dry-run, delete mode, anonymise mode, budget exhaustion,
    /// idempotent reruns, and cross-org safety (NFR-CSE-012/013/014, FR-CSE-081, C.3.4/ADR-008 R2).
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

        /// <summary>A clock that returns max value — any budget created from it is immediately exhausted.</summary>
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
            new CustomerErasureService(repo.Object, responseStore.Object, clock.Object, erasureLog.Object);

        private static ErasureRequest DeleteRequest(bool dryRun = false) => new ErasureRequest
        {
            CustomerId = CustomerId, InitiatingUserId = UserId, Mode = ErasureMode.Delete, DryRun = dryRun,
        };

        private static ErasureRequest AnonymiseRequest(bool dryRun = false) => new ErasureRequest
        {
            CustomerId = CustomerId, InitiatingUserId = UserId, Mode = ErasureMode.Anonymise, DryRun = dryRun,
        };

        // ── Dry-run ──────────────────────────────────────────────────────────

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
        public void Erase_DryRun_MutatesNothing()
        {
            var repo = RepoWithData(invitations: new[] { InvId1 }, suppressionLogs: new[] { SupLogId1 });
            var responseStore = ResponseStore();
            var erasureLog = ErasureLog();
            var clock = AmpleClock();
            var service = Build(repo, responseStore, clock, erasureLog);

            service.Erase(DeleteRequest(dryRun: true), AmpleBudget(clock));

            repo.Verify(r => r.DeleteInvitation(It.IsAny<Guid>()), Times.Never());
            repo.Verify(r => r.DeleteSuppressionLog(It.IsAny<Guid>()), Times.Never());
            responseStore.Verify(r => r.Anonymise(It.IsAny<Guid>()), Times.Never());
            // No audit row written for dry-run.
            erasureLog.Verify(w => w.Write(It.IsAny<ErasureRecord>()), Times.Never());
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
        // CustomerSurveyDataRepository filters on the org's LookupColumn, so a contact GUID on an
        // account org hits zero rows. We verify the service simply returns zeros and completes.

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

        // ── Audit log ────────────────────────────────────────────────────────

        [Fact]
        public void Erase_LiveRun_WritesOneAuditRow()
        {
            var repo = RepoWithData();
            var erasureLog = ErasureLog();
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            erasureLog.Verify(w => w.Write(It.IsAny<ErasureRecord>()), Times.Once());
        }

        [Fact]
        public void Erase_LiveRun_AuditRowCarriesRequestFields()
        {
            var repo = RepoWithData();
            ErasureRecord written = null;
            var erasureLog = new Mock<IErasureTraceWriter>();
            erasureLog.Setup(w => w.Write(It.IsAny<ErasureRecord>())).Callback<ErasureRecord>(r => written = r);
            var clock = AmpleClock();
            var service = Build(repo, ResponseStore(), clock, erasureLog);

            service.Erase(DeleteRequest(), AmpleBudget(clock));

            Assert.Equal(CustomerId, written.CustomerId);
            Assert.Equal(UserId, written.InitiatingUserId);
            Assert.Equal(ErasureMode.Delete, written.Mode);
            Assert.False(written.DryRun);
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
            var service = new Mock<Microsoft.Xrm.Sdk.IOrganizationService>();
            new Qdb.SurveyEngine.Data.ErasureLogWriter(service.Object).Write(SampleRecord());
            service.Verify(s => s.Create(It.Is<Microsoft.Xrm.Sdk.Entity>(e => e.LogicalName == ErasureLogWriter.ErasureLogTable)), Times.Once());
        }

        [Fact]
        public void Write_OrgFault_Propagates()
        {
            // An erasure without recorded evidence must not look successful to the caller.
            var service = new Mock<Microsoft.Xrm.Sdk.IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Microsoft.Xrm.Sdk.Entity>()))
                   .Throws(new System.ServiceModel.FaultException<Microsoft.Xrm.Sdk.OrganizationServiceFault>(new Microsoft.Xrm.Sdk.OrganizationServiceFault()));

            var writer = new Qdb.SurveyEngine.Data.ErasureLogWriter(service.Object);

            Assert.Throws<System.ServiceModel.FaultException<Microsoft.Xrm.Sdk.OrganizationServiceFault>>(() => writer.Write(SampleRecord()));
        }

        [Fact]
        public void Write_HappyPath_KeepsCallerAndCustomerAsText()
        {
            var service = new Mock<Microsoft.Xrm.Sdk.IOrganizationService>();
            Microsoft.Xrm.Sdk.Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Microsoft.Xrm.Sdk.Entity>())).Callback<Microsoft.Xrm.Sdk.Entity>(e => written = e);
            var record = SampleRecord();

            new Qdb.SurveyEngine.Data.ErasureLogWriter(service.Object).Write(record);

            Assert.Equal(record.InitiatingUserId.ToString("D"), written["qdb_caller_id"]);
            Assert.Equal(record.CustomerId.ToString("D"), written["qdb_customer_guid"]);
        }

        [Fact]
        public void Write_NullRecord_Throws()
        {
            var writer = new Qdb.SurveyEngine.Data.ErasureLogWriter(new Mock<Microsoft.Xrm.Sdk.IOrganizationService>().Object);
            Assert.Throws<ArgumentNullException>(() => writer.Write(null));
        }

        [Fact]
        public void ErasureLogTable_IsTheProvisionedTableName()
        {
            Assert.Equal("qdb_survey_erasure_log", ErasureLogWriter.ErasureLogTable);
        }
    }
}

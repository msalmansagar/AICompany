using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    // ── InvitationRepository additional paths ─────────────────────────────────
    // Note: TryCreate_ContactOrg_WritesTheCutomerAsContactLookup is a duplicate of
    // CrmAdapterTests.InvitationRepositoryTests.TryCreate_ContactOrg_WritesTheCustomerAsAContactLookup
    // and has been removed.

    public class InvitationRepositoryContactOrgTests
    {
        [Fact]
        public void HasSentInvitationSince_ContactOrg_QueryReturnsTrue()
        {
            var customerId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation", Guid.NewGuid());
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            Assert.True(new InvitationRepository(service.Object, CustomerLink.Contact).HasSentInvitationSince(customerId, new DateTime(2026, 1, 14, 0, 0, 0, DateTimeKind.Utc)));
        }
    }

    // ── InvitationRepository extra paths ─────────────────────────────────────
    // Note: TryCreate_OtherFault_IsRethrown is a duplicate of
    // CrmAdapterTests.InvitationRepositoryTests.TryCreate_OtherFault_IsRethrown
    // and has been removed.

    public class InvitationRepositoryExtraTests
    {
        [Fact]
        public void ExistsWithDedupeKey_RowPresent_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { new Entity("qdb_survey_invitation") }));

            Assert.True(new InvitationRepository(service.Object, CustomerLink.Account).ExistsWithDedupeKey("k"));
        }

        [Fact]
        public void ExistsWithDedupeKey_NoRow_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new InvitationRepository(service.Object, CustomerLink.Account).ExistsWithDedupeKey("k"));
        }

        [Fact]
        public void GetLastMilestoneIndex_NoRow_IsZero()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Equal(0, new InvitationRepository(service.Object, CustomerLink.Account).GetLastMilestoneIndex(Guid.NewGuid(), Guid.NewGuid()));
        }

        [Fact]
        public void TryCreate_DuplicateRecordError_ReturnsFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040237) };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            Assert.False(new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { DedupeKey = "k", Name = "n" }));
        }
    }

    // ── PostponedInvitationStore ──────────────────────────────────────────────

    public class PostponedInvitationStoreTests
    {
        private static PostponedInvitationStore Store(IOrganizationService service) =>
            new PostponedInvitationStore(service, CustomerLink.Account);

        private static PostponedInvitation Invitation() => new PostponedInvitation
        {
            Id = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Setup = new SurveySetup { Id = Guid.NewGuid() },
            RowVersion = "1",
        };

        [Fact]
        public void TryRelease_RowVersionMismatch_ReturnsFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882) };
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            Assert.False(Store(service.Object).TryRelease(Invitation(), new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc)));
        }

        [Fact]
        public void TryRelease_Success_SetsStatusToPending()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            Store(service.Object).TryRelease(Invitation(), new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));

            var target = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)captured).Target;
            Assert.Equal((int)InvitationStatus.Pending, target.GetAttributeValue<OptionSetValue>("qdb_status")?.Value);
        }

        [Fact]
        public void TryDiscard_Success_SetsStatusToDiscarded()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            Store(service.Object).TryDiscard(Invitation());

            var target = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)captured).Target;
            Assert.Equal((int)InvitationStatus.Discarded, target.GetAttributeValue<OptionSetValue>("qdb_status")?.Value);
        }
    }

    // ── PostponedInvitationStore.GetPostponed row mapping ─────────────────────

    public class PostponedInvitationStoreGetPostponedTests
    {
        private static readonly string SetupAlias = "setup";

        private static Entity BuildRow(
            Guid invitationId,
            Guid customerId,
            Guid setupId,
            EntityReference triggerRef,
            object isSetupActive,
            string sourceRecordId)
        {
            var row = new Entity("qdb_survey_invitation", invitationId);
            row["qdb_customer_id"] = new EntityReference("account", customerId);
            if (triggerRef != null) row["qdb_survey_trigger_id"] = triggerRef;
            row[SetupAlias + ".qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", setupId);
            row[SetupAlias + ".qdb_active_from"] = new AliasedValue("qdb_survey_setup", "qdb_active_from", null);
            row[SetupAlias + ".qdb_active_to"] = new AliasedValue("qdb_survey_setup", "qdb_active_to", null);
            if (isSetupActive != null)
                row[SetupAlias + ".qdb_is_active"] = new AliasedValue("qdb_survey_setup", "qdb_is_active", isSetupActive);
            row["qdb_source_table"] = "account";
            if (sourceRecordId != null) row["qdb_source_record_id"] = sourceRecordId;
            row.RowVersion = "v1";
            return row;
        }

        private static Mock<IOrganizationService> ServiceWithRow(Entity row)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new List<Entity> { row }) { MoreRecords = false });
            return service;
        }

        [Fact]
        public void GetPostponed_RowWithValidGuidSourceRecordAndActiveSetup_MapsCorrectly()
        {
            var invitationId = Guid.NewGuid();
            var customerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();
            var triggerId = Guid.NewGuid();
            var sourceId = Guid.NewGuid();

            var row = BuildRow(invitationId, customerId, setupId,
                new EntityReference("qdb_survey_trigger", triggerId),
                isSetupActive: true,
                sourceRecordId: sourceId.ToString("D"));

            var service = ServiceWithRow(row);
            var result = new PostponedInvitationStore(service.Object, CustomerLink.Account).GetPostponed();

            Assert.Single(result);
            Assert.Equal(customerId, result[0].CustomerId);
            Assert.Equal(triggerId, result[0].TriggerId);
            Assert.Equal(sourceId, result[0].SourceRecordId);
            Assert.True(result[0].IsSetupActive);
        }

        [Fact]
        public void GetPostponed_RowWithInvalidGuidSourceRecordAndNoIsSetupActive_SourceRecordNullAndSetupInactive()
        {
            var invitationId = Guid.NewGuid();
            var customerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();

            // No trigger ref → TriggerId = Guid.Empty; no qdb_is_active → false via null-coalescing
            var row = BuildRow(invitationId, customerId, setupId,
                triggerRef: null,
                isSetupActive: null,
                sourceRecordId: "not-a-valid-guid");

            var service = ServiceWithRow(row);
            var result = new PostponedInvitationStore(service.Object, CustomerLink.Account).GetPostponed();

            Assert.Single(result);
            Assert.Null(result[0].SourceRecordId);
            Assert.Equal(Guid.Empty, result[0].TriggerId);
            Assert.False(result[0].IsSetupActive);
        }
    }
}

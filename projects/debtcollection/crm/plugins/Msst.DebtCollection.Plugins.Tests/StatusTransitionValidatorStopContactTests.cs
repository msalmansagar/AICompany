using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Msst.DebtCollection.Plugins.Domain;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Tests for the stop-contact guard added to
    /// <see cref="StatusTransitionValidator"/> by §14.2 decision 1b (FR-043/097).
    /// Guard fires synchronously in PreOperation after the matrix check passes.
    /// </summary>
    public sealed class StatusTransitionValidatorStopContactTests
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string EntityCustomer = "msst_dcpcustomer";

        // ── Guard blocks a stop-contact customer entering a contact-bearing state ──

        [Fact]
        public void ValidateTransition_StopContactCustomer_TransitionIntoInProgress_Rejected()
        {
            // Arrange
            var customerId = Guid.NewGuid();
            var builder = BuildCaseWithCustomer(
                StatusTransitionMatrix.CaseStatus.Assigned,
                StatusTransitionMatrix.CaseStatus.InProgress,
                preImageCustomerId: customerId);
            SetupCustomerRetrieve(builder, customerId, stopContact: true);

            var validator = CreateValidator(builder);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            // Assert — message names the destination state and the reason
            Assert.Contains("In Progress", ex.Message);
            Assert.Contains("stop-contact", ex.Message);
        }

        // ── DeceasedInsuranceReview is not contact-bearing — always reachable ──────

        [Fact]
        public void ValidateTransition_StopContactCustomer_TransitionIntoDeceasedInsuranceReview_Allowed()
        {
            // Arrange — InProgress -> DeceasedInsuranceReview is the matrix-allowed path
            var customerId = Guid.NewGuid();
            var builder = BuildCaseWithCustomer(
                StatusTransitionMatrix.CaseStatus.InProgress,
                StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview,
                preImageCustomerId: customerId);
            // No Retrieve setup: the guard returns before calling the service
            // because DeceasedInsuranceReview is not in ContactBearingStates.

            var validator = CreateValidator(builder);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
            builder.MockService.Verify(
                s => s.Retrieve(EntityCustomer, It.IsAny<Guid>(), It.IsAny<ColumnSet>()),
                Times.Never);
        }

        // ── ReferredToLegal is not contact-bearing — always reachable ─────────────

        [Fact]
        public void ValidateTransition_StopContactCustomer_TransitionIntoReferredToLegal_Allowed()
        {
            // Arrange — PendingLegalReview -> ReferredToLegal is the matrix-allowed path
            var customerId = Guid.NewGuid();
            var builder = BuildCaseWithCustomer(
                StatusTransitionMatrix.CaseStatus.PendingLegalReview,
                StatusTransitionMatrix.CaseStatus.ReferredToLegal,
                preImageCustomerId: customerId);
            // No Retrieve setup: ReferredToLegal is not contact-bearing.

            var validator = CreateValidator(builder);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
            builder.MockService.Verify(
                s => s.Retrieve(EntityCustomer, It.IsAny<Guid>(), It.IsAny<ColumnSet>()),
                Times.Never);
        }

        // ── Flag false — contact-bearing transition proceeds normally ─────────────

        [Fact]
        public void ValidateTransition_CustomerWithoutStopContactFlag_ContactBearingTransition_Allowed()
        {
            // Arrange
            var customerId = Guid.NewGuid();
            var builder = BuildCaseWithCustomer(
                StatusTransitionMatrix.CaseStatus.Assigned,
                StatusTransitionMatrix.CaseStatus.InProgress,
                preImageCustomerId: customerId);
            SetupCustomerRetrieve(builder, customerId, stopContact: false);

            var validator = CreateValidator(builder);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
        }

        // ── No customer reference — guard is skipped ──────────────────────────────

        [Fact]
        public void ValidateTransition_CaseWithNoCustomerId_StopContactGuard_Skipped()
        {
            // Arrange — pre-image and target both lack msst_customerid
            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.Assigned);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.InProgress);
            builder.WithTarget(target);

            var validator = CreateValidator(builder);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert — no Retrieve and no exception
            Assert.Null(ex);
            builder.MockService.Verify(
                s => s.Retrieve(EntityCustomer, It.IsAny<Guid>(), It.IsAny<ColumnSet>()),
                Times.Never);
        }

        // ── Customer id sourced from pre-image, not from target ───────────────────

        [Fact]
        public void ValidateTransition_CustomerIdInPreImage_RetrievesUsingPreImageId()
        {
            // Arrange — pre-image has preImageCustomerId; target has a different id
            var preImageCustomerId = Guid.NewGuid();
            var targetCustomerId = Guid.NewGuid(); // must differ to prove source

            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.Assigned);
            preImage["msst_customerid"] = new EntityReference(EntityCustomer, preImageCustomerId);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.InProgress);
            target["msst_customerid"] = new EntityReference(EntityCustomer, targetCustomerId);
            builder.WithTarget(target);

            SetupCustomerRetrieve(builder, preImageCustomerId, stopContact: false);

            var validator = CreateValidator(builder);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert — Retrieve was called with the pre-image customer id, not the target id
            Assert.Null(ex);
            builder.MockService.Verify(
                s => s.Retrieve(EntityCustomer, preImageCustomerId, It.IsAny<ColumnSet>()),
                Times.Once);
            builder.MockService.Verify(
                s => s.Retrieve(EntityCustomer, targetCustomerId, It.IsAny<ColumnSet>()),
                Times.Never);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static PluginContextBuilder BuildCaseWithCustomer(
            int fromCode, int toCode, Guid preImageCustomerId)
        {
            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(fromCode);
            preImage["msst_customerid"] = new EntityReference(EntityCustomer, preImageCustomerId);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(toCode);
            builder.WithTarget(target);

            return builder;
        }

        private static void SetupCustomerRetrieve(
            PluginContextBuilder builder, Guid customerId, bool stopContact)
        {
            var customer = new Entity(EntityCustomer, customerId);
            customer["msst_stopcontact"] = stopContact;
            builder.MockService
                .Setup(s => s.Retrieve(EntityCustomer, customerId, It.IsAny<ColumnSet>()))
                .Returns(customer);
        }

        private static StatusTransitionValidator CreateValidator(PluginContextBuilder builder) =>
            new StatusTransitionValidator(builder.Service, builder.Tracing, builder.Context);
    }
}
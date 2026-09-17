using System;
using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    public sealed class StatusTransitionValidatorTests
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string EntityPtp = "qdb_collectionactivity";

        // ── Case transitions ──────────────────────────────────────────────────────

        [Fact]
        public void ValidateTransition_CaseNewToAssigned_AllowsTransition()
        {
            // Arrange
            var validator = BuildCaseValidator(
                StatusTransitionMatrix.CaseStatus.New,
                StatusTransitionMatrix.CaseStatus.Assigned);

            // Act & Assert
            var ex = Record.Exception(() => validator.ValidateTransition());
            Assert.Null(ex);
        }

        [Fact]
        public void ValidateTransition_CaseNewToInProgress_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var validator = BuildCaseValidator(
                StatusTransitionMatrix.CaseStatus.New,
                StatusTransitionMatrix.CaseStatus.InProgress);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            // Assert — message names the from and to states
            Assert.Contains("New", ex.Message);
            Assert.Contains("In Progress", ex.Message);
        }

        [Fact]
        public void ValidateTransition_CaseAssignedToEscalated_AllowsTransition()
        {
            // Arrange
            var validator = BuildCaseValidator(
                StatusTransitionMatrix.CaseStatus.Assigned,
                StatusTransitionMatrix.CaseStatus.EscalatedToSupervisor);

            // Act & Assert
            var ex = Record.Exception(() => validator.ValidateTransition());
            Assert.Null(ex);
        }

        [Fact]
        public void ValidateTransition_CaseSettledToClosed_AllowsTransition()
        {
            // Arrange
            var validator = BuildCaseValidator(
                StatusTransitionMatrix.CaseStatus.Settled,
                StatusTransitionMatrix.CaseStatus.Closed);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_CaseClosedToAssigned_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var validator = BuildCaseValidator(
                StatusTransitionMatrix.CaseStatus.Closed,
                StatusTransitionMatrix.CaseStatus.Assigned);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            Assert.Contains("Closed", ex.Message);
            Assert.Contains("Assigned", ex.Message);
        }

        [Fact]
        public void ValidateTransition_CaseNoStatusCodeChange_AllowsUpdate()
        {
            // Arrange — target does not contain statuscode; other field changed
            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.InProgress);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["qdb_casereason"] = "Updated reason only";
            builder.WithTarget(target);

            var validator = CreateValidator(builder);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        // ── PTP transitions ───────────────────────────────────────────────────────

        [Fact]
        public void ValidateTransition_PtpActiveToKept_AllowsTransition()
        {
            // Arrange
            var validator = BuildPtpValidator(
                StatusTransitionMatrix.PtpStatus.Active,
                StatusTransitionMatrix.PtpStatus.Kept);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_PtpActiveToBroken_AllowsTransition()
        {
            // Arrange
            var validator = BuildPtpValidator(
                StatusTransitionMatrix.PtpStatus.Active,
                StatusTransitionMatrix.PtpStatus.Broken);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_PtpBrokenToKept_AllowsManualCorrection()
        {
            // Arrange — Broken → Kept is the documented false-Broken reversal path
            var validator = BuildPtpValidator(
                StatusTransitionMatrix.PtpStatus.Broken,
                StatusTransitionMatrix.PtpStatus.Kept);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_PtpKeptToActive_ThrowsInvalidPluginExecutionException()
        {
            // Arrange — Kept is a terminal state
            var validator = BuildPtpValidator(
                StatusTransitionMatrix.PtpStatus.Kept,
                StatusTransitionMatrix.PtpStatus.Active);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            Assert.Contains("Kept", ex.Message);
            Assert.Contains("Active", ex.Message);
        }

        [Fact]
        public void ValidateTransition_PtpCancelledToBroken_ThrowsInvalidPluginExecutionException()
        {
            // Arrange — Cancelled is a terminal state
            var validator = BuildPtpValidator(
                StatusTransitionMatrix.PtpStatus.Cancelled,
                StatusTransitionMatrix.PtpStatus.Broken);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            Assert.Contains("Cancelled", ex.Message);
        }

        [Fact]
        public void ValidateTransition_PtpNoStatusChange_AllowsUpdate()
        {
            // Arrange
            var builder = new PluginContextBuilder()
                .WithEntity(EntityPtp, Guid.NewGuid());

            var preImage = new Entity(EntityPtp);
            preImage["qdb_ptpstatus"] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Active);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityPtp);
            target["qdb_reminderdate"] = DateTime.Today.AddDays(1);
            builder.WithTarget(target);

            var validator = CreateValidator(builder);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        // ── Pre-image absent ──────────────────────────────────────────────────────

        [Fact]
        public void ValidateTransition_CaseNoPreImage_AllowsTransition()
        {
            // Arrange — no pre-image registered; plugin skips validation
            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid())
                .WithEmptyPreImages();

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.Assigned);
            builder.WithTarget(target);

            var validator = CreateValidator(builder);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_PtpNoPreImage_AllowsTransition()
        {
            // Arrange — no pre-image registered; plugin skips validation for PTP too
            var builder = new PluginContextBuilder()
                .WithEntity(EntityPtp, Guid.NewGuid())
                .WithEmptyPreImages();

            var target = new Entity(EntityPtp);
            target["qdb_ptpstatus"] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Kept);
            builder.WithTarget(target);

            var validator = CreateValidator(builder);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static StatusTransitionValidator BuildCaseValidator(int fromCode, int toCode)
        {
            var builder = new PluginContextBuilder()
                .WithEntity(EntityCase, Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(fromCode);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(toCode);
            builder.WithTarget(target);

            return CreateValidator(builder);
        }

        // ── Platform default sentinel (pre-DefaultStatusAssigner records) ──────────

        [Fact]
        public void ValidateTransition_CasePreImageStatusCodeIs1_TreatsAsNewAllowsTransitionToAssigned()
        {
            // Arrange -- pre-image statuscode = 1 (platform sentinel for records that
            // pre-date DefaultStatusAssigner).  The normaliser must treat it as New,
            // making New -> Assigned a permitted first-transition.
            var validator = BuildCaseValidator(
                fromCode: 1,
                toCode: StatusTransitionMatrix.CaseStatus.Assigned);

            // Act & Assert
            Assert.Null(Record.Exception(() => validator.ValidateTransition()));
        }

        [Fact]
        public void ValidateTransition_CasePreImageStatusCodeIs1_TreatsAsNewRefusesTransitionToSettled()
        {
            // Arrange -- New -> Settled is not in the allowed matrix; normalising 1 to
            // New must not open up disallowed transitions.
            var validator = BuildCaseValidator(
                fromCode: 1,
                toCode: StatusTransitionMatrix.CaseStatus.Settled);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            // Assert
            Assert.Contains("New", ex.Message);
            Assert.Contains("Settled", ex.Message);
        }
        private static StatusTransitionValidator BuildPtpValidator(int fromCode, int toCode)
        {
            var builder = new PluginContextBuilder()
                .WithEntity(EntityPtp, Guid.NewGuid());

            var preImage = new Entity(EntityPtp);
            preImage["qdb_ptpstatus"] = new OptionSetValue(fromCode);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityPtp);
            target["qdb_ptpstatus"] = new OptionSetValue(toCode);
            builder.WithTarget(target);

            return CreateValidator(builder);
        }

        private static StatusTransitionValidator CreateValidator(PluginContextBuilder builder) =>
            new StatusTransitionValidator(builder.PluginContext, ContactHoldSettings.NotConfigured);
    }
}


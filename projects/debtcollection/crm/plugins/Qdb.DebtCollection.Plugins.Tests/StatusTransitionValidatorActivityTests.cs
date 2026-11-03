using System;
using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// The activity's own lifecycle, enforced server-side from Phase 6.
    ///
    /// Before this, the registered step filtered <c>qdb_ptpstatus</c> only: a promise could not be
    /// moved illegally, but the activity carrying it could be completed, re-opened and completed
    /// again at will. The React workspace writes straight through <c>Xrm.WebApi</c> with no service
    /// layer in between, so a plugin is the only place the lifecycle can actually be enforced.
    /// </summary>
    public sealed class StatusTransitionValidatorActivityTests
    {
        private const string EntityActivity = "qdb_collectionactivity";

        [Fact]
        public void ValidateTransition_ActivityOpenToInProgress_AllowsTransition()
        {
            // Arrange
            var validator = BuildActivityValidator(
                StatusTransitionMatrix.ActivityStatus.Open,
                StatusTransitionMatrix.ActivityStatus.InProgress);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
        }

        [Fact]
        public void ValidateTransition_ActivityInProgressToCompleted_AllowsTransition()
        {
            // Arrange
            var validator = BuildActivityValidator(
                StatusTransitionMatrix.ActivityStatus.InProgress,
                StatusTransitionMatrix.ActivityStatus.Completed);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
        }

        /// <summary>
        /// The rule that matters most, and the one <c>ImmutabilityGuard</c> already enforces: a
        /// finished activity stays finished. Without it an officer could complete an action, re-open
        /// it and complete it again, and the case history would be fiction.
        /// </summary>
        [Fact]
        public void ValidateTransition_ActivityCompletedToInProgress_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var validator = BuildActivityValidator(
                StatusTransitionMatrix.ActivityStatus.Completed,
                StatusTransitionMatrix.ActivityStatus.InProgress);

            // Act
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            // Assert — the message names both ends, so the refusal is readable
            Assert.Contains("Completed", ex.Message);
            Assert.Contains("In Progress", ex.Message);
        }

        [Fact]
        public void ValidateTransition_ActivityCancelledToOpen_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var validator = BuildActivityValidator(
                StatusTransitionMatrix.ActivityStatus.Cancelled,
                StatusTransitionMatrix.ActivityStatus.Open);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => validator.ValidateTransition());
        }

        /// <summary>
        /// A record created before <see cref="DefaultStatusAssigner"/> was deployed carries the
        /// platform sentinel 1 in its pre-image. Without normalisation its first transition — the
        /// one that takes it out of the sentinel — would be refused, stranding it permanently.
        /// </summary>
        [Fact]
        public void ValidateTransition_ActivityFromPlatformDefault_NormalisesToOpenAndAllows()
        {
            // Arrange
            var validator = BuildActivityValidator(1, StatusTransitionMatrix.ActivityStatus.Completed);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
        }

        /// <summary>
        /// One Update commonly moves both lifecycles — completing a promise changes
        /// <c>qdb_ptpstatus</c> and <c>statuscode</c> together — so both are validated, not one.
        /// </summary>
        [Fact]
        public void ValidateTransition_BothLifecyclesOnOneUpdate_ValidatesEach()
        {
            // Arrange — a legal activity move carrying an illegal promise move
            var builder = new PluginContextBuilder().WithEntity(EntityActivity, Guid.NewGuid());

            var preImage = new Entity(EntityActivity);
            preImage["statuscode"] = new OptionSetValue(StatusTransitionMatrix.ActivityStatus.Open);
            preImage["qdb_ptpstatus"] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Kept);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityActivity);
            target["statuscode"] = new OptionSetValue(StatusTransitionMatrix.ActivityStatus.Completed);
            target["qdb_ptpstatus"] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Active);
            builder.WithTarget(target);

            var validator = new StatusTransitionValidator(
                builder.PluginContext, ContactHoldSettings.NotConfigured);

            // Act — the promise move Kept -> Active is not permitted
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => validator.ValidateTransition());

            // Assert
            Assert.Contains("Kept", ex.Message);
        }

        /// <summary>
        /// An Update that touches neither status column must pass untouched — editing a note on an
        /// open activity is the commonest write in the phase and may not be refused.
        /// </summary>
        [Fact]
        public void ValidateTransition_ActivityUpdateWithoutStatus_AllowsTransition()
        {
            // Arrange
            var builder = new PluginContextBuilder().WithEntity(EntityActivity, Guid.NewGuid());

            var preImage = new Entity(EntityActivity);
            preImage["statuscode"] = new OptionSetValue(StatusTransitionMatrix.ActivityStatus.Open);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityActivity);
            target["subject"] = "an ordinary edit";
            builder.WithTarget(target);

            var validator = new StatusTransitionValidator(
                builder.PluginContext, ContactHoldSettings.NotConfigured);

            // Act
            var ex = Record.Exception(() => validator.ValidateTransition());

            // Assert
            Assert.Null(ex);
        }

        // ── Matrix-level coverage ─────────────────────────────────────────────────

        [Theory]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Open, StatusTransitionMatrix.ActivityStatus.Completed)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Open, StatusTransitionMatrix.ActivityStatus.Cancelled)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.InProgress, StatusTransitionMatrix.ActivityStatus.Cancelled)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.AwaitingApproval, StatusTransitionMatrix.ActivityStatus.Returned)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Returned, StatusTransitionMatrix.ActivityStatus.InProgress)]
        public void IsActivityTransitionAllowed_PermittedMoves_ReturnsTrue(int from, int to)
        {
            Assert.True(StatusTransitionMatrix.IsActivityTransitionAllowed(from, to));
        }

        [Theory]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Completed, StatusTransitionMatrix.ActivityStatus.Open)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Completed, StatusTransitionMatrix.ActivityStatus.Cancelled)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Cancelled, StatusTransitionMatrix.ActivityStatus.Completed)]
        [InlineData(StatusTransitionMatrix.ActivityStatus.Open, StatusTransitionMatrix.ActivityStatus.Open)]
        public void IsActivityTransitionAllowed_RefusedMoves_ReturnsFalse(int from, int to)
        {
            Assert.False(StatusTransitionMatrix.IsActivityTransitionAllowed(from, to));
        }

        [Fact]
        public void GetActivityStatusName_KnownCode_ReturnsDisplayName()
        {
            Assert.Equal("Awaiting Approval",
                StatusTransitionMatrix.GetActivityStatusName(
                    StatusTransitionMatrix.ActivityStatus.AwaitingApproval));
        }

        [Fact]
        public void GetActivityStatusName_UnknownCode_ReturnsTheCodeRatherThanGuessing()
        {
            Assert.Equal("999999", StatusTransitionMatrix.GetActivityStatusName(999999));
        }

        // ── Harness ───────────────────────────────────────────────────────────────

        private static StatusTransitionValidator BuildActivityValidator(int fromCode, int toCode)
        {
            var builder = new PluginContextBuilder()
                .WithEntity(EntityActivity, Guid.NewGuid());

            var preImage = new Entity(EntityActivity);
            preImage["statuscode"] = new OptionSetValue(fromCode);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityActivity);
            target["statuscode"] = new OptionSetValue(toCode);
            builder.WithTarget(target);

            return new StatusTransitionValidator(builder.PluginContext, ContactHoldSettings.NotConfigured);
        }
    }
}

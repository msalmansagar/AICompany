using System;
using Microsoft.Xrm.Sdk;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    public sealed class ImmutabilityGuardTests
    {
        private const int StateCodeOpen = 0;
        private const int StateCodeCompleted = 1;

        // ── Snapshot — always immutable ───────────────────────────────────────────

        [Fact]
        public void Guard_UpdateOnDelinquencySnapshot_AlwaysThrows()
        {
            // Arrange
            var guard = BuildGuard("msst_dcpdelinquencysnapshot", "Update");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnDelinquencySnapshot_AlwaysThrows()
        {
            // Arrange
            var guard = BuildGuard("msst_dcpdelinquencysnapshot", "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Audit log — always immutable ──────────────────────────────────────────

        [Fact]
        public void Guard_UpdateOnAuditLog_AlwaysThrows()
        {
            // Arrange
            var guard = BuildGuard("msst_dcpauditlog", "Update");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnAuditLog_AlwaysThrows()
        {
            // Arrange
            var guard = BuildGuard("msst_dcpauditlog", "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Sysadmin cannot bypass the guard ─────────────────────────────────────

        [Fact]
        public void Guard_UpdateOnDelinquencySnapshot_StillThrows_EvenWithNoRoleCheck()
        {
            // The plugin does not examine the caller's role.
            // Any user — including a system administrator — is blocked.
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity("msst_dcpdelinquencysnapshot", Guid.NewGuid())
                .WithUserId(Guid.NewGuid())  // arbitrary user id, could be sysadmin
                .WithTarget(new Entity("msst_dcpdelinquencysnapshot"))
                .WithEmptyPreImages();

            var guard = new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);

            // Act & Assert — no role exemption code path exists
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnCompletedAction_StillThrows_EvenWithNoRoleCheck()
        {
            // Same principle: completed activity immutability applies to all callers
            var guard = BuildActivityGuard("msst_dcpcollectionaction", StateCodeCompleted);
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Collection action — immutable when Completed ─────────────────────────

        [Fact]
        public void Guard_UpdateOnCompletedCollectionAction_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcollectionaction", StateCodeCompleted);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnCompletedCollectionAction_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcollectionaction", StateCodeCompleted, "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnOpenCollectionAction_AllowsUpdate()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcollectionaction", StateCodeOpen);

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        // ── Communication — immutable when Completed ──────────────────────────────

        [Fact]
        public void Guard_UpdateOnCompletedCommunication_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcommunication", StateCodeCompleted);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnCompletedCommunication_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcommunication", StateCodeCompleted, "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnOpenCommunication_AllowsUpdate()
        {
            // Arrange
            var guard = BuildActivityGuard("msst_dcpcommunication", StateCodeOpen);

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        [Fact]
        public void Guard_ActivityNoPreImage_AllowsUpdate()
        {
            // Arrange — no pre-image registered; guard cannot determine state, allows through
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity("msst_dcpcollectionaction", Guid.NewGuid())
                .WithTarget(new Entity("msst_dcpcollectionaction"))
                .WithEmptyPreImages();

            var guard = new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        // ── Collection case — Delete blocked, Update allowed (FR-025) ─────────────

        [Fact]
        public void Guard_DeleteOnCollectionCase_AlwaysThrows()
        {
            // Arrange — Delete on a case must be blocked for every caller (FR-025)
            var guard = BuildGuard("msst_dcpcollectioncase", "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnCollectionCase_AllowsUpdate()
        {
            // Arrange — Update must not be blocked; status transitions are normal operations
            var guard = BuildGuard("msst_dcpcollectioncase", "Update");

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        [Fact]
        public void Guard_DeleteOnCollectionCase_StillThrows_EvenWithNoRoleCheck()
        {
            // The plugin does not examine the caller's role.
            // A system administrator is blocked the same as any other caller.
            var builder = new PluginContextBuilder()
                .WithMessage("Delete")
                .WithEntity("msst_dcpcollectioncase", Guid.NewGuid())
                .WithUserId(Guid.NewGuid())
                .WithTarget(new Entity("msst_dcpcollectioncase"))
                .WithEmptyPreImages();

            var guard = new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);

            // Act & Assert — no role exemption code path exists
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static ImmutabilityGuard BuildGuard(string entityName, string message)
        {
            var builder = new PluginContextBuilder()
                .WithMessage(message)
                .WithEntity(entityName, Guid.NewGuid())
                .WithTarget(new Entity(entityName))
                .WithEmptyPreImages();

            return new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);
        }

        private static ImmutabilityGuard BuildActivityGuard(
            string entityName,
            int stateCode,
            string message = "Update")
        {
            var builder = new PluginContextBuilder()
                .WithMessage(message)
                .WithEntity(entityName, Guid.NewGuid())
                .WithTarget(new Entity(entityName));

            var preImage = new Entity(entityName);
            preImage["statecode"] = new OptionSetValue(stateCode);
            builder.WithPreImage(preImage);

            return new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);
        }
    }
}

using System;
using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
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
            var guard = BuildGuard("qdb_delinquencysnapshot", "Update");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnDelinquencySnapshot_AlwaysThrows()
        {
            // Arrange
            var guard = BuildGuard("qdb_delinquencysnapshot", "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Entities the guard does not own are left alone ────────────────────────
        //
        // The canonical schema records business history through the platform's native audit,
        // so there is no audit table for the guard to protect. These cases replace the two that
        // asserted immutability on the retired msst_dcpauditlog: what matters now is that the
        // guard does not block writes on tables outside its list.

        [Fact]
        public void Guard_UpdateOnUnguardedEntity_DoesNotThrow()
        {
            // Arrange
            var guard = BuildGuard("contact", "Update");

            // Act
            var ex = Record.Exception(() => guard.Guard());

            // Assert
            Assert.Null(ex);
        }

        [Fact]
        public void Guard_DeleteOnUnguardedEntity_DoesNotThrow()
        {
            // Arrange
            var guard = BuildGuard("qdb_collectionactivitytype", "Delete");

            // Act
            var ex = Record.Exception(() => guard.Guard());

            // Assert
            Assert.Null(ex);
        }

        // ── Sysadmin cannot bypass the guard ─────────────────────────────────────

        [Fact]
        public void Guard_UpdateOnDelinquencySnapshot_StillThrows_EvenWithNoRoleCheck()
        {
            // The plugin does not examine the caller's role.
            // Any user — including a system administrator — is blocked.
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity("qdb_delinquencysnapshot", Guid.NewGuid())
                .WithUserId(Guid.NewGuid())  // arbitrary user id, could be sysadmin
                .WithTarget(new Entity("qdb_delinquencysnapshot"))
                .WithEmptyPreImages();

            var guard = new ImmutabilityGuard(builder.Service, builder.Tracing, builder.Context);

            // Act & Assert — no role exemption code path exists
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnCompletedAction_StillThrows_EvenWithNoRoleCheck()
        {
            // Same principle: completed activity immutability applies to all callers
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeCompleted);
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        // ── Collection action — immutable when Completed ─────────────────────────

        [Fact]
        public void Guard_UpdateOnCompletedCollectionAction_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeCompleted);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnCompletedCollectionAction_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeCompleted, "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnOpenCollectionAction_AllowsUpdate()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeOpen);

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        // ── Communication — immutable when Completed ──────────────────────────────

        [Fact]
        public void Guard_UpdateOnCompletedCommunication_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeCompleted);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_DeleteOnCompletedCommunication_Throws()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeCompleted, "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnOpenCommunication_AllowsUpdate()
        {
            // Arrange
            var guard = BuildActivityGuard("qdb_collectionactivity", StateCodeOpen);

            // Act & Assert
            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        [Fact]
        public void Guard_ActivityNoPreImage_AllowsUpdate()
        {
            // Arrange — no pre-image registered; guard cannot determine state, allows through
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity("qdb_collectionactivity", Guid.NewGuid())
                .WithTarget(new Entity("qdb_collectionactivity"))
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
            var guard = BuildGuard("qdb_collectioncase", "Delete");

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(() => guard.Guard());
        }

        [Fact]
        public void Guard_UpdateOnCollectionCase_AllowsUpdate()
        {
            // Arrange — Update must not be blocked; status transitions are normal operations
            var guard = BuildGuard("qdb_collectioncase", "Update");

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
                .WithEntity("qdb_collectioncase", Guid.NewGuid())
                .WithUserId(Guid.NewGuid())
                .WithTarget(new Entity("qdb_collectioncase"))
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

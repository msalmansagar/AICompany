using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Tests for the activity subject composer against the canonical schema, where the activity
    /// type is a lookup onto reference data QDB maintains rather than an option set compiled into
    /// the assembly.
    /// </summary>
    public sealed class ActivitySubjectComposerTests
    {
        private const string EntityActivity = "qdb_collectionactivity";
        private const string EntityActivityType = "qdb_collectionactivitytype";
        private const string AttrActivityType = "qdb_activitytypeid";

        // ── Type name carried on the lookup ───────────────────────────────────────

        [Fact]
        public void ComposeSubject_ActivityTypeLookupCarriesName_UsesThatName()
        {
            // Arrange
            var target = new Entity(EntityActivity);
            target[AttrActivityType] = new EntityReference(EntityActivityType, Guid.NewGuid())
            {
                Name = "Collection Call",
            };
            var builder = BuildBuilder(target);
            var composer = BuildComposer(builder);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Collection Call", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_ActivityTypeLookupCarriesName_DoesNotRetrieve()
        {
            // Arrange
            var target = new Entity(EntityActivity);
            target[AttrActivityType] = new EntityReference(EntityActivityType, Guid.NewGuid())
            {
                Name = "Field Visit",
            };
            var builder = BuildBuilder(target);
            var composer = BuildComposer(builder);

            // Act
            composer.ComposeSubject();

            // Assert — the name was already there, so no round trip was needed
            builder.MockService.Verify(
                s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()),
                Times.Never);
        }

        // ── Type name resolved by Retrieve ────────────────────────────────────────

        [Fact]
        public void ComposeSubject_ActivityTypeLookupWithoutName_RetrievesTheName()
        {
            // Arrange
            var typeId = Guid.NewGuid();
            var target = new Entity(EntityActivity);
            target[AttrActivityType] = new EntityReference(EntityActivityType, typeId);

            var builder = BuildBuilder(target);
            SetupActivityTypeRetrieve(builder, typeId, "Supervisor Review");
            var composer = BuildComposer(builder);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Supervisor Review", (string)target["subject"]);
        }

        // ── Fallbacks ─────────────────────────────────────────────────────────────

        [Fact]
        public void ComposeSubject_NoActivityType_UsesFallbackLabel()
        {
            // Arrange — the column is required at application level, so this is a programmatic create
            var target = new Entity(EntityActivity);
            var composer = BuildComposer(BuildBuilder(target));

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Collection Activity", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_ActivityTypeRecordHasNoName_UsesFallbackLabel()
        {
            // Arrange
            var typeId = Guid.NewGuid();
            var target = new Entity(EntityActivity);
            target[AttrActivityType] = new EntityReference(EntityActivityType, typeId);

            var builder = BuildBuilder(target);
            SetupActivityTypeRetrieve(builder, typeId, null);
            var composer = BuildComposer(builder);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Collection Activity", (string)target["subject"]);
        }

        // ── Date and caller-supplied subject ──────────────────────────────────────

        [Fact]
        public void ComposeSubject_Activity_SetsSubjectContainingDate()
        {
            // Arrange
            var target = new Entity(EntityActivity);
            var composer = BuildComposer(BuildBuilder(target));

            // Act
            composer.ComposeSubject();

            // Assert — subject must contain a date in yyyy-MM-dd format
            var todayPrefix = DateTime.UtcNow.ToString("yyyy-MM-");
            Assert.Contains(todayPrefix, (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_SubjectAlreadySupplied_LeavesItUntouched()
        {
            // Arrange
            var target = new Entity(EntityActivity);
            target["subject"] = "Agreed wording from the officer";
            var composer = BuildComposer(BuildBuilder(target));

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Equal("Agreed wording from the officer", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_EntityOtherThanCollectionActivity_WritesNoSubject()
        {
            // Arrange
            var target = new Entity("email");
            var builder = new PluginContextBuilder()
                .WithMessage("Create")
                .WithEntity("email", Guid.NewGuid())
                .WithTarget(target)
                .WithEmptyPreImages();

            // Act
            BuildComposer(builder).ComposeSubject();

            // Assert
            Assert.False(target.Contains("subject"));
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static PluginContextBuilder BuildBuilder(Entity target) =>
            new PluginContextBuilder()
                .WithMessage("Create")
                .WithEntity(EntityActivity, Guid.NewGuid())
                .WithTarget(target)
                .WithEmptyPreImages();

        private static void SetupActivityTypeRetrieve(
            PluginContextBuilder builder, Guid typeId, string name)
        {
            var activityType = new Entity(EntityActivityType, typeId);
            if (name != null) activityType["qdb_name"] = name;

            builder.MockService
                .Setup(s => s.Retrieve(EntityActivityType, typeId, It.IsAny<ColumnSet>()))
                .Returns(activityType);
        }

        private static ActivitySubjectComposer BuildComposer(PluginContextBuilder builder) =>
            new ActivitySubjectComposer(builder.Service, builder.Tracing, builder.Context);
    }
}

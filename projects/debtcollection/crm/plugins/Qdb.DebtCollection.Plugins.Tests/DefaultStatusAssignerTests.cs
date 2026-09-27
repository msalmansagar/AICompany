using System;
using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    public sealed class DefaultStatusAssignerTests
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string EntityPtp = "qdb_collectionactivity";
        private const string AttrStatusCode = "statuscode";
        private const int PlatformDefaultStatusCode = 1;

        // ── Case entity ───────────────────────────────────────────────────────────

        [Fact]
        public void AssignDefaultStatus_CaseCreateWithoutStatusCode_SetsStatusCodeToNew()
        {
            // Arrange
            var target = new Entity(EntityCase);
            target["qdb_casereason"] = "Missing payment";
            var assigner = BuildAssigner(EntityCase, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.CaseStatus.New, result.Value);
        }

        [Fact]
        public void AssignDefaultStatus_CaseCreateWithPlatformDefault1_ReplacesWithNew()
        {
            // Arrange -- caller sent statuscode=1 (the platform sentinel), which the
            // matrix has no entry for; the assigner must replace it with New.
            var target = new Entity(EntityCase);
            target[AttrStatusCode] = new OptionSetValue(PlatformDefaultStatusCode);
            var assigner = BuildAssigner(EntityCase, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.CaseStatus.New, result.Value);
        }

        [Fact]
        public void AssignDefaultStatus_CaseCreateWithExplicitAssigned_LeavesStatusCodeUnchanged()
        {
            // Arrange -- a caller that explicitly supplies a valid custom code (Assigned)
            // must be honoured; the assigner must not overwrite it.
            var target = new Entity(EntityCase);
            target[AttrStatusCode] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.Assigned);
            var assigner = BuildAssigner(EntityCase, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.CaseStatus.Assigned, result.Value);
        }

        // ── Collection activity ───────────────────────────────────────────────────

        [Fact]
        public void AssignDefaultStatus_ActivityCreateWithoutStatusCode_SetsStatusCodeToOpen()
        {
            // Arrange
            var target = new Entity(EntityPtp);
            target["qdb_amount"] = 500m;
            var assigner = BuildAssigner(EntityPtp, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.ActivityStatus.Open, result.Value);
        }

        // ── Promise to pay is an activity, so its own status opens too ────────────

        [Fact]
        public void AssignDefaultStatus_ActivityWithPromiseDate_SetsPromiseStatusToActive()
        {
            // Arrange
            var target = new Entity(EntityPtp);
            target["qdb_ptpdate"] = DateTime.Today.AddDays(7);
            var assigner = BuildAssigner(EntityPtp, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>("qdb_ptpstatus");
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.PtpStatus.Active, result.Value);
        }

        [Fact]
        public void AssignDefaultStatus_ActivityWithoutPromiseDate_LeavesPromiseStatusUnset()
        {
            // Arrange — an activity that carries no promise date is not a promise to pay
            var target = new Entity(EntityPtp);
            target["qdb_amount"] = 500m;
            var assigner = BuildAssigner(EntityPtp, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            Assert.Null(target.GetAttributeValue<OptionSetValue>("qdb_ptpstatus"));
        }

        [Fact]
        public void AssignDefaultStatus_ActivityWithSuppliedPromiseStatus_LeavesItUntouched()
        {
            // Arrange
            var target = new Entity(EntityPtp);
            target["qdb_ptpdate"] = DateTime.Today.AddDays(7);
            target["qdb_ptpstatus"] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Rescheduled);
            var assigner = BuildAssigner(EntityPtp, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>("qdb_ptpstatus");
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.PtpStatus.Rescheduled, result.Value);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static DefaultStatusAssigner BuildAssigner(string entityName, Entity target)
        {
            var builder = new PluginContextBuilder()
                .WithEntity(entityName, Guid.NewGuid())
                .WithMessage("Create")
                .WithTarget(target);

            return new DefaultStatusAssigner(builder.Service, builder.Tracing, builder.Context);
        }
    }
}

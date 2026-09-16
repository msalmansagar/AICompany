using System;
using Microsoft.Xrm.Sdk;
using Msst.DebtCollection.Plugins.Domain;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    public sealed class DefaultStatusAssignerTests
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string EntityPtp = "msst_dcpptprecord";
        private const string AttrStatusCode = "statuscode";
        private const int PlatformDefaultStatusCode = 1;

        // ── Case entity ───────────────────────────────────────────────────────────

        [Fact]
        public void AssignDefaultStatus_CaseCreateWithoutStatusCode_SetsStatusCodeToNew()
        {
            // Arrange
            var target = new Entity(EntityCase);
            target["msst_casereason"] = "Missing payment";
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

        // ── PTP entity ────────────────────────────────────────────────────────────

        [Fact]
        public void AssignDefaultStatus_PtpCreateWithoutStatusCode_SetsStatusCodeToOpen()
        {
            // Arrange
            var target = new Entity(EntityPtp);
            target["msst_amount"] = 500m;
            var assigner = BuildAssigner(EntityPtp, target);

            // Act
            assigner.AssignDefaultStatus();

            // Assert
            var result = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            Assert.NotNull(result);
            Assert.Equal(StatusTransitionMatrix.PtpStatus.Open, result.Value);
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

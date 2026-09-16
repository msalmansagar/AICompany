using System;
using System.Collections.Generic;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    public sealed class StopContactQueueMoverTests
    {
        private const string EntityCustomer = "msst_dcpcustomer";
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string QueueName = "Deceased & Insurance";

        // ── Happy path ────────────────────────────────────────────────────────────

        [Fact]
        public void MoveToDeceasedQueue_WhenStopContactFlipsToTrue_MovesEachActiveCase()
        {
            // Arrange
            var customerId = Guid.NewGuid();
            var caseId1 = Guid.NewGuid();
            var caseId2 = Guid.NewGuid();
            var queueId = Guid.NewGuid();

            var builder = BuildFlipToTrue(customerId, wasFalse: true);
            SetupQueueQuery(builder, queueId);
            SetupCaseQuery(builder, customerId, caseId1, caseId2);

            var mover = CreateMover(builder);

            // Act
            mover.MoveToDeceasedQueue();

            // Assert — AddToQueueRequest executed for each case
            builder.MockService.Verify(
                s => s.Execute(It.Is<OrganizationRequest>(r =>
                    r is AddToQueueRequest &&
                    ((AddToQueueRequest)r).Target.Id == caseId1)),
                Times.Once);

            builder.MockService.Verify(
                s => s.Execute(It.Is<OrganizationRequest>(r =>
                    r is AddToQueueRequest &&
                    ((AddToQueueRequest)r).Target.Id == caseId2)),
                Times.Once);
        }

        [Fact]
        public void MoveToDeceasedQueue_WhenStopContactFlipsToTrue_NoActiveCases_DoesNotExecute()
        {
            // Arrange
            var customerId = Guid.NewGuid();
            var queueId = Guid.NewGuid();

            var builder = BuildFlipToTrue(customerId, wasFalse: true);
            SetupQueueQuery(builder, queueId);
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == EntityCase)))
                .Returns(new EntityCollection());

            var mover = CreateMover(builder);

            // Act
            mover.MoveToDeceasedQueue();

            // Assert — no Execute calls issued
            builder.MockService.Verify(
                s => s.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
        }

        // ── No-op paths ───────────────────────────────────────────────────────────

        [Fact]
        public void MoveToDeceasedQueue_WhenStopContactAlreadyTrueInPreImage_DoesNothing()
        {
            // Arrange — was already true; not a flip
            var builder = BuildFlipToTrue(Guid.NewGuid(), wasFalse: false);
            var mover = CreateMover(builder);

            // Act
            mover.MoveToDeceasedQueue();

            // Assert — no service call at all
            builder.MockService.Verify(
                s => s.RetrieveMultiple(It.IsAny<QueryExpression>()), Times.Never);
        }

        [Fact]
        public void MoveToDeceasedQueue_WhenStopContactIsSetToFalse_DoesNothing()
        {
            // Arrange — msst_stopcontact = false on target
            var customerId = Guid.NewGuid();
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCustomer, customerId);

            var target = new Entity(EntityCustomer);
            target["msst_stopcontact"] = false;
            builder.WithTarget(target);

            var preImage = new Entity(EntityCustomer);
            preImage["msst_stopcontact"] = false;
            builder.WithPreImage(preImage);

            var mover = CreateMover(builder);

            // Act
            mover.MoveToDeceasedQueue();

            // Assert
            builder.MockService.Verify(
                s => s.RetrieveMultiple(It.IsAny<QueryExpression>()), Times.Never);
        }

        [Fact]
        public void MoveToDeceasedQueue_WhenStopContactAttributeAbsentOnTarget_DoesNothing()
        {
            // Arrange — target does not contain msst_stopcontact at all
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCustomer, Guid.NewGuid())
                .WithTarget(new Entity(EntityCustomer))
                .WithEmptyPreImages();

            var mover = CreateMover(builder);

            // Act
            mover.MoveToDeceasedQueue();

            // Assert
            builder.MockService.Verify(
                s => s.RetrieveMultiple(It.IsAny<QueryExpression>()), Times.Never);
        }

        // ── Queue not found ────────────────────────────────────────────────────────

        [Fact]
        public void MoveToDeceasedQueue_WhenQueueNotFound_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var builder = BuildFlipToTrue(Guid.NewGuid(), wasFalse: true);
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == "queue")))
                .Returns(new EntityCollection());

            var mover = CreateMover(builder);

            // Act & Assert
            var ex = Assert.Throws<InvalidPluginExecutionException>(() => mover.MoveToDeceasedQueue());
            Assert.Contains(QueueName, ex.Message);
        }

        [Fact]
        public void MoveToDeceasedQueue_WhenNoPreImageRegistered_AndStopContactTrue_TreatsAsFlip()
        {
            // Arrange — no pre-image: the code assumes the flag is newly set (conservative path)
            var customerId = Guid.NewGuid();
            var queueId = Guid.NewGuid();

            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCustomer, customerId);

            var target = new Entity(EntityCustomer);
            target["msst_stopcontact"] = true;
            builder.WithTarget(target);
            builder.WithEmptyPreImages();

            SetupQueueQuery(builder, queueId);
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == EntityCase)))
                .Returns(new EntityCollection());

            var mover = CreateMover(builder);

            // Act — should proceed to queue resolution even without a pre-image
            mover.MoveToDeceasedQueue();

            // Assert — queue was queried (conservative: treat as flip when pre-image absent)
            builder.MockService.Verify(
                s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == "queue")),
                Times.Once);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static PluginContextBuilder BuildFlipToTrue(Guid customerId, bool wasFalse)
        {
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCustomer, customerId);

            var target = new Entity(EntityCustomer);
            target["msst_stopcontact"] = true;
            builder.WithTarget(target);

            var preImage = new Entity(EntityCustomer);
            preImage["msst_stopcontact"] = !wasFalse; // if wasFalse=true → preImage=false
            builder.WithPreImage(preImage);

            return builder;
        }

        private static void SetupQueueQuery(PluginContextBuilder builder, Guid queueId)
        {
            var queueEntity = new Entity("queue", queueId);
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == "queue")))
                .Returns(new EntityCollection(new List<Entity> { queueEntity }));
        }

        private static void SetupCaseQuery(
            PluginContextBuilder builder,
            Guid customerId,
            params Guid[] caseIds)
        {
            var cases = new List<Entity>();
            foreach (var id in caseIds)
                cases.Add(new Entity(EntityCase, id));

            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.Is<QueryExpression>(q => q.EntityName == EntityCase)))
                .Returns(new EntityCollection(cases));
        }

        private static StopContactQueueMover CreateMover(PluginContextBuilder builder) =>
            new StopContactQueueMover(builder.Service, builder.Tracing, builder.Context);
    }
}

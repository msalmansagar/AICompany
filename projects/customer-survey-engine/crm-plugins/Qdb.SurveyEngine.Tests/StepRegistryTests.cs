using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    // ── StepRegistry ─────────────────────────────────────────────────────────

    public class StepRegistryTests
    {
        private const string UpdateMessage = "Update";
        private const string CreateMessage = "Create";
        private const string Table = "qdb_cheque_clearing";
        private const string StatusField = "statuscode";

        // Sets up service to answer SDK metadata lookups for message, filter and plugin type.
        private static Mock<IOrganizationService> ServiceWithSdk(
            Guid messageId, Guid filterId, Guid pluginTypeId, Guid? stepId = null, Guid? preImageId = null)
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Loose);
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessage")))
                   .Returns(new EntityCollection(new[] { new Entity("sdkmessage", messageId) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessagefilter")))
                   .Returns(filterId != Guid.Empty
                       ? new EntityCollection(new[] { new Entity("sdkmessagefilter", filterId) })
                       : new EntityCollection());
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "plugintype")))
                   .Returns(new EntityCollection(new[] { new Entity("plugintype", pluginTypeId) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(stepId.HasValue
                       ? new EntityCollection(new[] { new Entity("sdkmessageprocessingstep", stepId.Value) })
                       : new EntityCollection());
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstepimage")))
                   .Returns(preImageId.HasValue
                       ? new EntityCollection(new[] { new Entity("sdkmessageprocessingstepimage", preImageId.Value) })
                       : new EntityCollection());
            return service;
        }

        private static string EntityName(QueryBase q) => (q as QueryExpression)?.EntityName ?? string.Empty;

        [Fact]
        public void StepName_UpdateSpec_IncludesTableAndMessage()
        {
            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            var name = StepRegistry.StepName(spec);
            Assert.Contains(Table, name);
            Assert.Contains(UpdateMessage, name);
            Assert.Contains(StepRegistry.PluginTypeName, name);
        }

        [Fact]
        public void SupportsMessage_FilterExists_IsTrue()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
            Assert.True(new StepRegistry(service.Object).SupportsMessage(Table, UpdateMessage));
        }

        [Fact]
        public void SupportsMessage_NoFilter_IsFalse()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.Empty, Guid.NewGuid());
            Assert.False(new StepRegistry(service.Object).SupportsMessage(Table, UpdateMessage));
        }

        [Fact]
        public void Find_NoStep_IsNull()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null);
            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            Assert.Null(new StepRegistry(service.Object).Find(spec));
        }

        [Fact]
        public void Find_StepWithNoPreImage_PreImageAttributesIsNull()
        {
            var stepId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: stepId, preImageId: null);
            var row = new Entity("sdkmessageprocessingstep", stepId) { ["statecode"] = new OptionSetValue(0) };
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(new EntityCollection(new[] { row }));

            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            var step = new StepRegistry(service.Object).Find(spec);

            Assert.NotNull(step);
            Assert.True(step.IsEnabled);
            Assert.Null(step.PreImageAttributes);
        }

        [Fact]
        public void Find_StepWithPreImage_PreImageAttributesAreReturned()
        {
            var stepId = Guid.NewGuid();
            var preImageId = Guid.NewGuid();
            var step = new Entity("sdkmessageprocessingstep", stepId) { ["statecode"] = new OptionSetValue(1) };
            var preImage = new Entity("sdkmessageprocessingstepimage", preImageId) { ["attributes"] = "statuscode,qdb_type" };
            var service = new Mock<IOrganizationService>(MockBehavior.Loose);
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessage")))
                   .Returns(new EntityCollection(new[] { new Entity("sdkmessage", Guid.NewGuid()) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(new EntityCollection(new[] { step }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstepimage")))
                   .Returns(new EntityCollection(new[] { preImage }));

            var registered = new StepRegistry(service.Object).Find(new StepSpec(UpdateMessage, Table, StatusField));

            Assert.Equal("statuscode,qdb_type", registered.PreImageAttributes);
            Assert.False(registered.IsEnabled); // statecode = 1 = disabled
        }

        [Fact]
        public void Create_UpdateStep_CreatesStepAndPreImage()
        {
            var messageId = Guid.NewGuid();
            var filterId = Guid.NewGuid();
            var pluginTypeId = Guid.NewGuid();
            var service = ServiceWithSdk(messageId, filterId, pluginTypeId);
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            var stepId = new StepRegistry(service.Object).Create(new StepSpec(UpdateMessage, Table, StatusField));

            Assert.NotEqual(Guid.Empty, stepId);
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstep")), Times.Once());
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
        }

        [Fact]
        public void Create_CreateStep_DoesNotCreatePreImage()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            new StepRegistry(service.Object).Create(new StepSpec(CreateMessage, Table, StatusField));

            // Create message → no filtering attributes → no pre-image
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Never());
        }

        [Fact]
        public void Reconfigure_NoPreImage_CreatesNewPreImage()
        {
            var stepId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null, preImageId: null);
            service.Setup(s => s.Update(It.IsAny<Entity>()));
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            new StepRegistry(service.Object).Reconfigure(stepId, new StepSpec(UpdateMessage, Table, StatusField));

            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
        }

        [Fact]
        public void Reconfigure_ExistingPreImage_UpdatesIt()
        {
            var stepId = Guid.NewGuid();
            var preImageId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null, preImageId: preImageId);
            service.Setup(s => s.Update(It.IsAny<Entity>()));

            new StepRegistry(service.Object).Reconfigure(stepId, new StepSpec(UpdateMessage, Table, StatusField));

            service.Verify(s => s.Update(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstep")), Times.Once());
            service.Verify(s => s.Update(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
            service.Verify(s => s.Create(It.IsAny<Entity>()), Times.Never());
        }

        [Fact]
        public void SetEnabled_True_SetsStateToZero()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            new StepRegistry(service.Object).SetEnabled(Guid.NewGuid(), true);

            var req = captured as Microsoft.Crm.Sdk.Messages.SetStateRequest;
            Assert.NotNull(req);
            Assert.Equal(0, req.State.Value);
        }

        [Fact]
        public void SetEnabled_False_SetsStateToOne()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            new StepRegistry(service.Object).SetEnabled(Guid.NewGuid(), false);

            var req = captured as Microsoft.Crm.Sdk.Messages.SetStateRequest;
            Assert.NotNull(req);
            Assert.Equal(1, req.State.Value);
        }

        [Fact]
        public void Delete_CallsServiceDelete()
        {
            var service = new Mock<IOrganizationService>();
            var id = Guid.NewGuid();

            new StepRegistry(service.Object).Delete(id);

            service.Verify(s => s.Delete("sdkmessageprocessingstep", id), Times.Once());
        }
    }
}

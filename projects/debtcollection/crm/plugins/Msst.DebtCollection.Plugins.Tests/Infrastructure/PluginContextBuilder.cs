using System;
using Microsoft.Xrm.Sdk;
using Moq;

namespace Msst.DebtCollection.Plugins.Tests.Infrastructure
{
    /// <summary>
    /// Builds mocked CRM SDK services for unit tests.
    /// Each test instantiates a builder, configures the context properties it needs,
    /// and passes <see cref="Service"/>, <see cref="Tracing"/>, <see cref="Context"/>
    /// directly into the logic class under test.
    ///
    /// Tests access <see cref="MockService"/> and <see cref="MockContext"/> for
    /// setup and verification.
    /// </summary>
    public sealed class PluginContextBuilder
    {
        /// <summary>Mock of <see cref="IOrganizationService"/>.</summary>
        public Mock<IOrganizationService> MockService { get; } = new Mock<IOrganizationService>();

        /// <summary>Mock of <see cref="ITracingService"/>.</summary>
        public Mock<ITracingService> MockTracing { get; } = new Mock<ITracingService>();

        /// <summary>Mock of <see cref="IPluginExecutionContext"/>.</summary>
        public Mock<IPluginExecutionContext> MockContext { get; } = new Mock<IPluginExecutionContext>();

        /// <summary>Concrete service passed to logic class constructors.</summary>
        public IOrganizationService Service => MockService.Object;

        /// <summary>Concrete tracing service passed to logic class constructors.</summary>
        public ITracingService Tracing => MockTracing.Object;

        /// <summary>Concrete execution context passed to logic class constructors.</summary>
        public IPluginExecutionContext Context => MockContext.Object;

        /// <summary>Sets <c>MessageName</c> on the execution context.</summary>
        public PluginContextBuilder WithMessage(string messageName)
        {
            MockContext.Setup(c => c.MessageName).Returns(messageName);
            return this;
        }

        /// <summary>Sets <c>PrimaryEntityName</c> and <c>PrimaryEntityId</c>.</summary>
        public PluginContextBuilder WithEntity(string entityName, Guid entityId)
        {
            MockContext.Setup(c => c.PrimaryEntityName).Returns(entityName);
            MockContext.Setup(c => c.PrimaryEntityId).Returns(entityId);
            return this;
        }

        /// <summary>Puts <paramref name="target"/> in <c>InputParameters["Target"]</c>.</summary>
        public PluginContextBuilder WithTarget(Entity target)
        {
            var inputParams = new ParameterCollection { { "Target", target } };
            MockContext.Setup(c => c.InputParameters).Returns(inputParams);
            return this;
        }

        /// <summary>Puts <paramref name="preImage"/> in <c>PreEntityImages["PreImage"]</c>.</summary>
        public PluginContextBuilder WithPreImage(Entity preImage)
        {
            var images = new EntityImageCollection { { "PreImage", preImage } };
            MockContext.Setup(c => c.PreEntityImages).Returns(images);
            return this;
        }

        /// <summary>Sets <c>UserId</c> on the execution context.</summary>
        public PluginContextBuilder WithUserId(Guid userId)
        {
            MockContext.Setup(c => c.UserId).Returns(userId);
            return this;
        }

        /// <summary>Sets <c>CorrelationId</c> on the execution context.</summary>
        public PluginContextBuilder WithCorrelationId(Guid correlationId)
        {
            MockContext.Setup(c => c.CorrelationId).Returns(correlationId);
            return this;
        }

        /// <summary>Returns an empty <c>PreEntityImages</c> collection.</summary>
        public PluginContextBuilder WithEmptyPreImages()
        {
            MockContext.Setup(c => c.PreEntityImages).Returns(new EntityImageCollection());
            return this;
        }
    }
}

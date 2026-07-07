using System;
using Microsoft.Xrm.Sdk;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>Minimal IPluginExecutionContext for offline adapter tests.</summary>
    public sealed class FakePluginContext : IPluginExecutionContext
    {
        public ParameterCollection InputParameters { get; set; } = new ParameterCollection();
        public ParameterCollection OutputParameters { get; set; } = new ParameterCollection();
        public ParameterCollection SharedVariables { get; set; } = new ParameterCollection();
        public string MessageName { get; set; } = "";
        public string PrimaryEntityName { get; set; } = "";
        public string SecondaryEntityName { get; set; } = "";
        public Guid UserId { get; set; } = Guid.NewGuid();
        public Guid InitiatingUserId { get; set; } = Guid.NewGuid();
        public Guid BusinessUnitId { get; set; }
        public Guid OrganizationId { get; set; }
        public string OrganizationName { get; set; } = "test";
        public Guid PrimaryEntityId { get; set; }
        public Guid CorrelationId { get; set; }
        public Guid OperationId { get; set; }
        public Guid? RequestId { get; set; }
        public DateTime OperationCreatedOn { get; set; }
        public int Mode { get; set; }
        public int IsolationMode { get; set; }
        public int Depth { get; set; }
        public int Stage { get; set; }
        public bool IsExecutingOffline { get; set; }
        public bool IsOfflinePlayback { get; set; }
        public bool IsInTransaction { get; set; }
        public EntityImageCollection PreEntityImages { get; set; } = new EntityImageCollection();
        public EntityImageCollection PostEntityImages { get; set; } = new EntityImageCollection();
        public EntityReference OwningExtension { get; set; } = new EntityReference();
        public IPluginExecutionContext ParentContext => null!;
    }

    /// <summary>Wires the fake context + org service into an IServiceProvider for IPlugin.Execute.</summary>
    public sealed class FakeServiceProvider : IServiceProvider
    {
        private readonly IPluginExecutionContext _context;
        private readonly IOrganizationServiceFactory _factory;

        public FakeServiceProvider(IPluginExecutionContext context, IOrganizationService service)
        {
            _context = context;
            _factory = new FakeServiceFactory(service);
        }

        public object GetService(Type serviceType)
        {
            if (serviceType == typeof(IPluginExecutionContext)) return _context;
            if (serviceType == typeof(IOrganizationServiceFactory)) return _factory;
            if (serviceType == typeof(ITracingService)) return new NullTracingService();
            throw new NotSupportedException($"Fake provider has no service for {serviceType.Name}.");
        }

        private sealed class FakeServiceFactory : IOrganizationServiceFactory
        {
            private readonly IOrganizationService _service;
            public FakeServiceFactory(IOrganizationService service) => _service = service;
            public IOrganizationService CreateOrganizationService(Guid? userId) => _service;
        }

        private sealed class NullTracingService : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }
    }
}

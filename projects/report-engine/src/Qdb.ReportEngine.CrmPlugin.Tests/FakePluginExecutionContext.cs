using System;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// A plugin execution context that can be built in a test.
    ///
    /// The interface is large and almost none of it matters here — the audit plugin reads the
    /// message name, the target, the pre-image and the initiating user. The rest is present because
    /// the interface demands it, and throwing from the unused members would only obscure which
    /// property a future test actually needed.
    /// </summary>
    internal sealed class FakeContext : IPluginExecutionContext
    {
        public ParameterCollection InputParameters { get; set; } = new ParameterCollection();

        public ParameterCollection OutputParameters { get; set; } = new ParameterCollection();

        public EntityImageCollection PreEntityImages { get; set; } = new EntityImageCollection();

        public EntityImageCollection PostEntityImages { get; set; } = new EntityImageCollection();

        public string MessageName { get; set; } = string.Empty;

        public string PrimaryEntityName { get; set; } = string.Empty;

        public Guid InitiatingUserId { get; set; }

        public Guid UserId { get; set; }

        public int Stage { get; set; } = 40;

        public int Mode { get; set; }

        public int IsolationMode { get; set; }

        public int Depth { get; set; } = 1;

        public Guid BusinessUnitId { get; set; }

        public Guid CorrelationId { get; set; }

        public Guid OrganizationId { get; set; }

        public string OrganizationName { get; set; } = string.Empty;

        public Guid PrimaryEntityId { get; set; }

        public Guid? RequestId { get; set; }

        public string SecondaryEntityName { get; set; } = string.Empty;

        public ParameterCollection SharedVariables { get; set; } = new ParameterCollection();

        public DateTime OperationCreatedOn { get; set; }

        public Guid OperationId { get; set; }

        public Guid OwningExtension_Id { get; set; }

        public EntityReference OwningExtension { get; set; }

        public bool IsExecutingOffline { get; set; }

        public bool IsInTransaction { get; set; } = true;

        public bool IsOfflinePlayback { get; set; }

        public int IsolationLevel { get; set; }

        public IPluginExecutionContext ParentContext { get; set; }
    }
}

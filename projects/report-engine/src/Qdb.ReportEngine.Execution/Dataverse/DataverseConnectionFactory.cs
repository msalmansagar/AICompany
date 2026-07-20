using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Produces per-user CRM connections (ADR-RPT-008 §1). Cloud path acquires a delegated
/// Dataverse token via MSAL On-Behalf-Of; on-prem path opens an Organization Service
/// connection with impersonation set to the requesting user. Skeleton — both paths return
/// a handle without a live connection; bodies are filled in during Phase-4 build.
/// </summary>
public sealed class DataverseConnectionFactory(IOptions<DashboardOptions> options) : IDataverseConnectionFactory
{
    private readonly DeploymentTarget _target = options.Value.Target;

    /// <inheritdoc />
    public Task<IDataverseConnection> CreateForUserAsync(ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        // TODO(build): CLOUD — exchange context.DelegatedToken for a Dataverse token via MSAL OBO
        //   (ConfidentialClientApplication.AcquireTokenOnBehalfOf) and open a ServiceClient with it.
        // TODO(build): ON-PREM — open a CrmServiceClient and set CallerId = context.UserId (impersonation).
        // Never fall back to raw service-principal execution silently (ADR-RPT-008 §1).
        IDataverseConnection connection = new NullConnection(context.UserId, _target);
        return Task.FromResult(connection);
    }

    // Placeholder connection so the composition graph resolves in the scaffold.
    private sealed class NullConnection(Guid userId, DeploymentTarget target) : IDataverseConnection
    {
        public Guid ExecutingUserId { get; } = userId;

        public DeploymentTarget Target { get; } = target;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

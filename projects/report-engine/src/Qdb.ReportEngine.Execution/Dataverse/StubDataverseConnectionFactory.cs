using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Fallback connection factory used when Dataverse is not configured, so the host still boots and
/// dashboards degrade gracefully (each widget resolves to a "not configured" error rather than the
/// process failing to start). The real path is <see cref="WebApiDataverseConnectionFactory"/>.
/// </summary>
public sealed class StubDataverseConnectionFactory(IOptions<DashboardOptions> options) : IDataverseConnectionFactory
{
    private readonly DeploymentTarget _target = options.Value.Target;

    /// <inheritdoc />
    public Task<IDataverseConnection> CreateForUserAsync(ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        IDataverseConnection connection = new UnconfiguredConnection(context.UserId, _target);
        return Task.FromResult(connection);
    }

    // Reports its inability rather than returning empty rows that would read as real, empty data.
    private sealed class UnconfiguredConnection(Guid userId, DeploymentTarget target) : IDataverseConnection
    {
        private readonly DeploymentTarget _target = target;

        public Guid ExecutingUserId { get; } = userId;

        public Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> RetrieveMultipleAsync(
            string entityLogicalName, string fetchXml, CancellationToken cancellationToken) =>
            throw new NotSupportedException($"Dataverse is not configured ({_target}); cannot execute queries.");

        public Task<IReadOnlyDictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> RetrieveMultipleBatchAsync(
            IReadOnlyList<BatchQuery> queries, CancellationToken cancellationToken) =>
            throw new NotSupportedException($"Dataverse is not configured ({_target}); cannot execute queries.");

        public Task<Guid> CreateAsync(string entityLogicalName, IReadOnlyDictionary<string, object?> attributes, CancellationToken cancellationToken) =>
            throw new NotSupportedException($"Dataverse is not configured ({_target}); cannot create records.");

        public Task UpdateAsync(string entityLogicalName, Guid id, IReadOnlyDictionary<string, object?> attributes, CancellationToken cancellationToken) =>
            throw new NotSupportedException($"Dataverse is not configured ({_target}); cannot update records.");

        public Task DeleteAsync(string entityLogicalName, Guid id, CancellationToken cancellationToken) =>
            throw new NotSupportedException($"Dataverse is not configured ({_target}); cannot delete records.");

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

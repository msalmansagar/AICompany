using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Tests;

/// <summary>Hand-rolled test doubles for the CRM boundary (no mocking framework — real doubles).</summary>
internal sealed class FakeDataProvider(IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>> data) : IReportDataProvider
{
    public int BatchCallCount { get; private set; }

    public Task<Result<IReadOnlyList<DataPoint>>> QueryWidgetAsync(
        DashboardWidget widget, ReportExecutionContext context, CancellationToken cancellationToken)
        => throw new NotSupportedException("Fan-out uses the batch path.");

    public Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>> QueryWidgetBatchAsync(
        IReadOnlyList<DashboardWidget> sameEntityWidgets, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        BatchCallCount++;
        IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>> result = sameEntityWidgets.ToDictionary(
            w => w.Id,
            w => data.TryGetValue(w.Id, out var d) ? d : (IReadOnlyList<DataPoint>)[]);
        return Task.FromResult(Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>.Success(result));
    }
}

internal sealed class FakeSecurityEnforcer : ISecurityEnforcer
{
    public bool CanRead { get; init; } = true;

    public bool UserOwned { get; init; }

    public Task<bool> CanReadEntityAsync(string entity, ReportExecutionContext context, CancellationToken cancellationToken)
        => Task.FromResult(CanRead);

    public Task<bool> IsUserOwnedEntityAsync(string entity, CancellationToken cancellationToken)
        => Task.FromResult(UserOwned);
}

internal sealed class PassThroughPolicy : IWidgetExecutionPolicy
{
    public Task<T> ExecuteAsync<T>(string target, Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
        => operation(cancellationToken);
}

/// <summary>Records every create and hands back a deterministic sequential id, so a writer test can
/// assert both the ordering (parent before children) and the @odata.bind wiring.</summary>
internal sealed record CreatedRecord(string Entity, IReadOnlyDictionary<string, object?> Attributes);

internal sealed class RecordingConnection(Guid userId) : IDataverseConnection
{
    private int _sequence;

    public Guid ExecutingUserId { get; } = userId;

    public List<CreatedRecord> Created { get; } = [];

    public Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> RetrieveMultipleAsync(
        string entityLogicalName, string fetchXml, CancellationToken cancellationToken)
        => throw new NotSupportedException();

    public Task<IReadOnlyDictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> RetrieveMultipleBatchAsync(
        IReadOnlyList<BatchQuery> queries, CancellationToken cancellationToken)
        => throw new NotSupportedException();

    public List<(string Entity, Guid Id)> Updated { get; } = [];

    public List<(string Entity, Guid Id)> Deleted { get; } = [];

    public Task<Guid> CreateAsync(string entityLogicalName, IReadOnlyDictionary<string, object?> attributes, CancellationToken cancellationToken)
    {
        Created.Add(new CreatedRecord(entityLogicalName, attributes));
        return Task.FromResult(IdOf(_sequence++));
    }

    public Task UpdateAsync(string entityLogicalName, Guid id, IReadOnlyDictionary<string, object?> attributes, CancellationToken cancellationToken)
    {
        Updated.Add((entityLogicalName, id));
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string entityLogicalName, Guid id, CancellationToken cancellationToken)
    {
        Deleted.Add((entityLogicalName, id));
        return Task.CompletedTask;
    }

    /// <summary>The deterministic id assigned to the <paramref name="index"/>-th created record.</summary>
    public Guid IdOf(int index) => new(index + 1, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0]);

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

internal sealed class RecordingConnectionFactory(RecordingConnection connection) : IDataverseConnectionFactory
{
    public Task<IDataverseConnection> CreateForUserAsync(ReportExecutionContext context, CancellationToken cancellationToken)
        => Task.FromResult<IDataverseConnection>(connection);
}

/// <summary>A dashboard loader stub returning a preset definition (or a failure) — lets the writer's
/// update path be tested without a live CRM.</summary>
internal sealed class FakeDashboardLoader(Result<DashboardDefinition> load) : IDashboardDefinitionLoader
{
    public Task<Result<DashboardDefinition>> LoadAsync(Guid dashboardId, ReportExecutionContext context, CancellationToken cancellationToken)
        => Task.FromResult(load);

    public Task<Result<IReadOnlyList<DashboardSummary>>> ListAsync(ReportExecutionContext context, CancellationToken cancellationToken)
        => Task.FromResult(Result<IReadOnlyList<DashboardSummary>>.Success([]));
}

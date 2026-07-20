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

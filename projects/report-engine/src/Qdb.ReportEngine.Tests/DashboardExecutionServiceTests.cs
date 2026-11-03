using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Caching;
using Qdb.ReportEngine.Execution.Dashboards;
using Qdb.ReportEngine.Execution.Resilience;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class DashboardExecutionServiceTests
{
    private static readonly Guid WidgetA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid WidgetB = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");

    [Fact]
    public async Task ExecuteAsync_ResolvesEachWidgetWithProviderData()
    {
        var provider = new FakeDataProvider(new Dictionary<Guid, IReadOnlyList<DataPoint>>
        {
            [WidgetA] = [new DataPoint("Doha", 100m)],
            [WidgetB] = [new DataPoint("Doha", 3m)]
        });
        var sut = BuildSut(provider, new FakeSecurityEnforcer());

        var result = await sut.ExecuteAsync(TwoWidgetDashboard(), Context(), CancellationToken.None);

        Assert.Equal(2, result.Widgets.Count);
        Assert.Equal(100m, result.Widgets.Single(w => w.WidgetId == WidgetA).Data[0].Value);
        Assert.All(result.Widgets, w => Assert.Null(w.Error));
    }

    [Fact]
    public async Task ExecuteAsync_SameEntityWidgets_IssueOneBatchCall()
    {
        var provider = new FakeDataProvider(new Dictionary<Guid, IReadOnlyList<DataPoint>>
        {
            [WidgetA] = [], [WidgetB] = []
        });
        var sut = BuildSut(provider, new FakeSecurityEnforcer());

        await sut.ExecuteAsync(TwoWidgetDashboard(), Context(), CancellationToken.None);

        Assert.Equal(1, provider.BatchCallCount); // both same-entity widgets grouped into one round-trip
    }

    [Fact]
    public async Task ExecuteAsync_SecondRun_ServesFromCacheWithoutHittingProvider()
    {
        var provider = new FakeDataProvider(new Dictionary<Guid, IReadOnlyList<DataPoint>>
        {
            [WidgetA] = [new DataPoint("Doha", 1m)], [WidgetB] = [new DataPoint("Doha", 2m)]
        });
        var cache = new InMemoryCacheStore();
        var sut = BuildSut(provider, new FakeSecurityEnforcer(), cache);
        var dashboard = TwoWidgetDashboard();
        var context = Context();

        await sut.ExecuteAsync(dashboard, context, CancellationToken.None);
        var second = await sut.ExecuteAsync(dashboard, context, CancellationToken.None);

        Assert.Equal(1, provider.BatchCallCount); // second run fully cached
        Assert.All(second.Widgets, w => Assert.True(w.FromCache));
    }

    [Fact]
    public async Task ExecuteAsync_UserCannotReadEntity_ReturnsAccessDeniedAndSkipsProvider()
    {
        var provider = new FakeDataProvider(new Dictionary<Guid, IReadOnlyList<DataPoint>>());
        var sut = BuildSut(provider, new FakeSecurityEnforcer { CanRead = false });

        var result = await sut.ExecuteAsync(TwoWidgetDashboard(), Context(), CancellationToken.None);

        Assert.Equal(0, provider.BatchCallCount);
        Assert.All(result.Widgets, w => Assert.True(w.AccessDenied));
    }

    [Fact]
    public async Task ExecuteStreamAsync_StreamsOneResultPerWidget()
    {
        var provider = new FakeDataProvider(new Dictionary<Guid, IReadOnlyList<DataPoint>>
        {
            [WidgetA] = [], [WidgetB] = []
        });
        var sut = BuildSut(provider, new FakeSecurityEnforcer());

        var streamed = new List<WidgetResult>();
        await foreach (var r in sut.ExecuteStreamAsync(TwoWidgetDashboard(), Context(), CancellationToken.None))
        {
            streamed.Add(r);
        }

        Assert.Equal(2, streamed.Count);
    }

    // --- fixtures -----------------------------------------------------------

    private static DashboardExecutionService BuildSut(
        IReportDataProvider provider, ISecurityEnforcer security, ICacheStore? cache = null)
    {
        var options = Options.Create(new DashboardOptions
        {
            MaxConcurrentQueries = 40,
            MaxConcurrentWidgetQueries = 6,
            GroupSameEntityQueries = true
        });

        return new DashboardExecutionService(
            provider,
            cache ?? new InMemoryCacheStore(),
            security,
            new WidgetQueryPlanner(options),
            new InFlightRequestCoalescer(),
            new PassThroughPolicy(),
            new DashboardConcurrencyGate(options),
            options,
            NullLogger<DashboardExecutionService>.Instance);
    }

    private static DashboardDefinition TwoWidgetDashboard() => new()
    {
        Id = Guid.NewGuid(),
        Title = "Customer 360",
        Sections =
        [
            new DashboardSection
            {
                Id = Guid.NewGuid(),
                Columns = 4,
                Widgets =
                [
                    new DashboardWidget { Id = WidgetA, Kind = WidgetKind.Metric, Entity = "qdb_loanapplication", MeasureAttribute = "qdb_requestedamount", Aggregation = Aggregation.Sum },
                    new DashboardWidget { Id = WidgetB, Kind = WidgetKind.Chart, Entity = "qdb_loanapplication", GroupByAttribute = "qdb_branchid", Aggregation = Aggregation.Count }
                ]
            }
        ]
    };

    private static ReportExecutionContext Context() => new()
    {
        UserId = Guid.Parse("cccccccc-0000-0000-0000-000000000003"),
        RoleSetHash = "role-set-hash"
    };
}

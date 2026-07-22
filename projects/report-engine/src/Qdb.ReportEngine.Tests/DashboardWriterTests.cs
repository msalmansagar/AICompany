using Microsoft.Extensions.Logging.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class DashboardWriterTests
{
    private static DashboardWriter BuildWriter(RecordingConnection connection, Result<DashboardDefinition>? existing = null)
    {
        var loader = new FakeDashboardLoader(existing ?? Result<DashboardDefinition>.Failure(DomainError.NotFound("qdb_dashboard")));
        return new DashboardWriter(new RecordingConnectionFactory(connection), loader, NullLogger<DashboardWriter>.Instance);
    }

    [Fact]
    public async Task CreateAsync_WritesDashboardThenSectionsThenWidgets_BoundToParents()
    {
        var connection = new RecordingConnection(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var sut = BuildWriter(connection);

        var result = await sut.CreateAsync(SampleDashboard(), Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(3, connection.Created.Count);

        var dashboard = connection.Created[0];
        var section = connection.Created[1];
        var widget = connection.Created[2];

        Assert.Equal("qdb_dashboard", dashboard.Entity);
        Assert.Equal("Portfolio Overview", dashboard.Attributes["qdb_dashboardname"]);

        Assert.Equal("qdb_dashboardsection", section.Entity);
        Assert.Equal($"/qdb_dashboards({connection.IdOf(0)})", section.Attributes["qdb_DashboardId@odata.bind"]);

        Assert.Equal("qdb_dashboardwidget", widget.Entity);
        Assert.Equal("Chart", widget.Attributes["qdb_kind"]);
        Assert.Equal("account", widget.Attributes["qdb_entity"]);
        Assert.Equal($"/qdb_dashboardsections({connection.IdOf(1)})", widget.Attributes["qdb_DashboardSectionId@odata.bind"]);
    }

    [Fact]
    public async Task CreateAsync_ReturnsTheNewDashboardId()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection);

        var result = await sut.CreateAsync(SampleDashboard(), Context(), CancellationToken.None);

        Assert.Equal(connection.IdOf(0), result.Value);
    }

    [Fact]
    public async Task UpdateAsync_DeletesExistingChildren_UpdatesDashboard_AndRecreatesSections()
    {
        var dashboardId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var oldSectionId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var oldWidgetId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var existing = ExistingDashboard(dashboardId, oldSectionId, oldWidgetId);
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<DashboardDefinition>.Success(existing));

        var result = await sut.UpdateAsync(dashboardId, SampleDashboard(), Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(dashboardId, result.Value);
        // Old widget deleted before its section.
        Assert.Equal(("qdb_dashboardwidget", oldWidgetId), connection.Deleted[0]);
        Assert.Equal(("qdb_dashboardsection", oldSectionId), connection.Deleted[1]);
        // Dashboard record patched (not recreated).
        Assert.Equal(("qdb_dashboard", dashboardId), Assert.Single(connection.Updated));
        // New section + widget recreated.
        Assert.Equal("qdb_dashboardsection", connection.Created[0].Entity);
        Assert.Equal("qdb_dashboardwidget", connection.Created[1].Entity);
    }

    [Fact]
    public async Task UpdateAsync_WhenDashboardNotFound_ReturnsThatError_AndWritesNothing()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<DashboardDefinition>.Failure(DomainError.NotFound("qdb_dashboard")));

        var result = await sut.UpdateAsync(Guid.NewGuid(), SampleDashboard(), Context(), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("not_found", result.Error!.Code);
        Assert.Empty(connection.Deleted);
        Assert.Empty(connection.Created);
    }

    [Fact]
    public async Task DeleteAsync_DeletesWidgetsThenSectionsThenDashboard()
    {
        var dashboardId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var sectionId = Guid.Parse("66666666-6666-6666-6666-666666666666");
        var widgetId = Guid.Parse("77777777-7777-7777-7777-777777777777");
        var existing = ExistingDashboard(dashboardId, sectionId, widgetId);
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<DashboardDefinition>.Success(existing));

        var result = await sut.DeleteAsync(dashboardId, Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(("qdb_dashboardwidget", widgetId), connection.Deleted[0]);
        Assert.Equal(("qdb_dashboardsection", sectionId), connection.Deleted[1]);
        Assert.Equal(("qdb_dashboard", dashboardId), connection.Deleted[2]);
        Assert.Empty(connection.Created);
    }

    [Fact]
    public async Task DeleteAsync_WhenDashboardNotFound_ReturnsError_AndDeletesNothing()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<DashboardDefinition>.Failure(DomainError.NotFound("qdb_dashboard")));

        var result = await sut.DeleteAsync(Guid.NewGuid(), Context(), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("not_found", result.Error!.Code);
        Assert.Empty(connection.Deleted);
    }

    private static DashboardDefinition ExistingDashboard(Guid id, Guid sectionId, Guid widgetId) => new()
    {
        Id = id,
        Title = "Old title",
        Sections =
        [
            new DashboardSection
            {
                Id = sectionId,
                Title = "Old section",
                Columns = 2,
                Widgets = [new DashboardWidget { Id = widgetId, Kind = WidgetKind.Table, Entity = "account" }]
            }
        ]
    };

    private static DashboardDefinition SampleDashboard() => new()
    {
        Id = Guid.NewGuid(),
        Title = "Portfolio Overview",
        Sections =
        [
            new DashboardSection
            {
                Id = Guid.NewGuid(),
                Title = "Row 1",
                Columns = 3,
                Widgets =
                [
                    new DashboardWidget
                    {
                        Id = Guid.NewGuid(),
                        Kind = WidgetKind.Chart,
                        Entity = "account",
                        GroupByAttribute = "industrycode",
                        MeasureAttribute = "revenue",
                        Aggregation = Aggregation.Sum,
                        ChartType = "bar"
                    }
                ]
            }
        ]
    };

    private static ReportExecutionContext Context() => new()
    {
        UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        RoleSetHash = "test"
    };
}

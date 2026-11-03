using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dashboards;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class CacheKeyBuilderTests
{
    private static DashboardWidget Widget() => new()
    {
        Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        Kind = WidgetKind.Chart,
        Entity = "qdb_loanapplication",
        GroupByAttribute = "qdb_branchid",
        MeasureAttribute = "qdb_requestedamount",
        Aggregation = Aggregation.Sum
    };

    private static ReportExecutionContext Context(string roleSetHash, Guid userId) =>
        new() { UserId = userId, RoleSetHash = roleSetHash };

    [Fact]
    public void Build_SameInputs_ProducesSameKey()
    {
        var ctx = Context("roleA", Guid.NewGuid());

        var a = CacheKeyBuilder.Build(Widget(), ctx, isUserOwned: false);
        var b = CacheKeyBuilder.Build(Widget(), ctx, isUserOwned: false);

        Assert.Equal(a, b);
    }

    [Fact]
    public void Build_DifferentRoleSet_ProducesDifferentKey()
    {
        var userId = Guid.NewGuid();

        var a = CacheKeyBuilder.Build(Widget(), Context("roleA", userId), isUserOwned: false);
        var b = CacheKeyBuilder.Build(Widget(), Context("roleB", userId), isUserOwned: false);

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void Build_BuOwnedEntity_IgnoresUserId_SoUsersShareCache()
    {
        var a = CacheKeyBuilder.Build(Widget(), Context("roleA", Guid.NewGuid()), isUserOwned: false);
        var b = CacheKeyBuilder.Build(Widget(), Context("roleA", Guid.NewGuid()), isUserOwned: false);

        Assert.Equal(a, b);
    }

    [Fact]
    public void Build_UserOwnedEntity_IncludesUserId_SoUsersDoNotShareCache()
    {
        var a = CacheKeyBuilder.Build(Widget(), Context("roleA", Guid.NewGuid()), isUserOwned: true);
        var b = CacheKeyBuilder.Build(Widget(), Context("roleA", Guid.NewGuid()), isUserOwned: true);

        Assert.NotEqual(a, b);
    }
}

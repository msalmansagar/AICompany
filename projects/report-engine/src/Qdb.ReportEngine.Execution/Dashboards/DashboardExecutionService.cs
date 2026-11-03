using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dashboards;

/// <summary>
/// Governs dashboard fan-out per ADR-RPT-008. Composes existing V1 components without
/// modifying them. The six controls are wired here:
/// (1) per-user execution via <see cref="IDataverseConnectionFactory"/> inside the data provider;
/// (2) two-level concurrency caps via <see cref="DashboardConcurrencyGate"/>;
/// (3) same-entity grouping via <see cref="IWidgetQueryPlanner"/>;
/// (4) role-keyed cache via <see cref="ICacheStore"/> + <see cref="CacheKeyBuilder"/>;
/// (5) progressive streaming via <see cref="ExecuteStreamAsync"/>;
/// (6) resilience via <see cref="IWidgetExecutionPolicy"/> and <see cref="IInFlightRequestCoalescer"/>.
/// </summary>
public sealed class DashboardExecutionService(
    IReportDataProvider dataProvider,
    ICacheStore cache,
    ISecurityEnforcer security,
    IWidgetQueryPlanner planner,
    IInFlightRequestCoalescer coalescer,
    IWidgetExecutionPolicy policy,
    DashboardConcurrencyGate gate,
    IOptions<DashboardOptions> options,
    ILogger<DashboardExecutionService> logger) : IDashboardExecutionService
{
    private readonly DashboardOptions _options = options.Value;

    /// <inheritdoc />
    public async IAsyncEnumerable<WidgetResult> ExecuteStreamAsync(
        DashboardDefinition dashboard,
        ReportExecutionContext context,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dashboard);
        ArgumentNullException.ThrowIfNull(context);

        var groups = planner.Plan(dashboard);
        using var perDashboard = gate.CreatePerDashboardLimiter();
        var channel = Channel.CreateUnbounded<WidgetResult>();

        // Producer: each same-entity group runs concurrently; results stream as they resolve.
        var producer = Task.Run(async () =>
        {
            try
            {
                await Task.WhenAll(groups.Select(g =>
                    ExecuteGroupAsync(g, context, perDashboard, channel.Writer, cancellationToken)));
            }
            finally
            {
                channel.Writer.Complete();
            }
        }, cancellationToken);

        await foreach (var result in channel.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return result;
        }

        await producer.ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<DashboardResult> ExecuteAsync(
        DashboardDefinition dashboard,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var results = new List<WidgetResult>();
        await foreach (var r in ExecuteStreamAsync(dashboard, context, cancellationToken).ConfigureAwait(false))
        {
            results.Add(r);
        }

        return new DashboardResult
        {
            DashboardId = dashboard.Id,
            Widgets = results,
            TotalDuration = sw.Elapsed
        };
    }

    // Resolves one same-entity group: security gate, cache-first, batch the misses.
    private async Task ExecuteGroupAsync(
        WidgetQueryGroup group,
        ReportExecutionContext context,
        SemaphoreSlim perDashboard,
        ChannelWriter<WidgetResult> writer,
        CancellationToken cancellationToken)
    {
        if (!await security.CanReadEntityAsync(group.Entity, context, cancellationToken).ConfigureAwait(false))
        {
            foreach (var w in group.Widgets)
            {
                await writer.WriteAsync(AccessDenied(w), cancellationToken).ConfigureAwait(false);
            }

            return;
        }

        var userOwned = await security.IsUserOwnedEntityAsync(group.Entity, cancellationToken).ConfigureAwait(false);
        var misses = new List<DashboardWidget>();

        foreach (var widget in group.Widgets)
        {
            var key = CacheKeyBuilder.Build(widget, context, userOwned);
            var cached = await cache.GetAsync(key, cancellationToken).ConfigureAwait(false);
            if (cached is not null)
            {
                await writer.WriteAsync(Hit(widget, cached), cancellationToken).ConfigureAwait(false);
            }
            else
            {
                misses.Add(widget);
            }
        }

        if (misses.Count > 0)
        {
            await FetchMissesAsync(group.Entity, misses, context, userOwned, perDashboard, writer, cancellationToken)
                .ConfigureAwait(false);
        }
    }

    // Fetches cache-missed widgets under the concurrency gate, batched, coalesced, and retried.
    private async Task FetchMissesAsync(
        string entity,
        IReadOnlyList<DashboardWidget> misses,
        ReportExecutionContext context,
        bool userOwned,
        SemaphoreSlim perDashboard,
        ChannelWriter<WidgetResult> writer,
        CancellationToken cancellationToken)
    {
        await perDashboard.WaitAsync(cancellationToken).ConfigureAwait(false);
        using var globalLease = await gate.AcquireGlobalAsync(cancellationToken).ConfigureAwait(false);
        var sw = Stopwatch.StartNew();
        try
        {
            var groupKey = $"grp:{entity}:{context.RoleSetHash}:{string.Join(',', misses.Select(m => m.Id))}";
            var batch = await coalescer.GetOrAddAsync(groupKey,
                ct => policy.ExecuteAsync(entity, c => dataProvider.QueryWidgetBatchAsync(misses, context, c), ct),
                cancellationToken).ConfigureAwait(false);

            foreach (var widget in misses)
            {
                await writer.WriteAsync(
                    await MaterialiseAsync(widget, context, userOwned, batch, sw.Elapsed, cancellationToken).ConfigureAwait(false),
                    cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            perDashboard.Release();
        }
    }

    // Turns a batch outcome into a per-widget result and populates the cache on success.
    private async Task<WidgetResult> MaterialiseAsync(
        DashboardWidget widget,
        ReportExecutionContext context,
        bool userOwned,
        Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>> batch,
        TimeSpan duration,
        CancellationToken cancellationToken)
    {
        if (!batch.IsSuccess)
        {
            logger.LogWarning("Widget {WidgetId} failed: {Code} (corr {CorrelationId})",
                widget.Id, batch.Error!.Code, context.CorrelationId);
            return new WidgetResult { WidgetId = widget.Id, Error = batch.Error, Duration = duration };
        }

        var data = batch.Value.TryGetValue(widget.Id, out var d) ? d : [];
        var key = CacheKeyBuilder.Build(widget, context, userOwned);
        await cache.SetAsync(key, data, _options.WidgetCacheTtl, cancellationToken).ConfigureAwait(false);

        if (duration > _options.PerWidgetSla)
        {
            logger.LogInformation("Widget {WidgetId} exceeded per-widget SLA ({Elapsed}ms > {SlaMs}ms)",
                widget.Id, duration.TotalMilliseconds, _options.PerWidgetSla.TotalMilliseconds);
        }

        return new WidgetResult { WidgetId = widget.Id, Data = data, Duration = duration };
    }

    private static WidgetResult Hit(DashboardWidget w, IReadOnlyList<DataPoint> data) =>
        new() { WidgetId = w.Id, Data = data, FromCache = true };

    private static WidgetResult AccessDenied(DashboardWidget w) =>
        new() { WidgetId = w.Id, AccessDenied = true, Error = DomainError.PermissionDenied(w.Entity) };
}

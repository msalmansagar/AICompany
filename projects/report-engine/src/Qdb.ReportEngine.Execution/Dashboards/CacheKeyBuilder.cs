using System.Security.Cryptography;
using System.Text;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dashboards;

/// <summary>
/// Builds the role-keyed widget cache key of ADR-RPT-007 / ADR-RPT-008 §4:
/// <c>SHA-256(widgetId | sortedParams | roleSetHash [| userId])</c>. The <c>userId</c>
/// component is appended only for user-owned entities, so BU/org-owned widgets share
/// cache entries across users with the same role set.
/// </summary>
public static class CacheKeyBuilder
{
    /// <summary>Builds the cache key for <paramref name="widget"/> under <paramref name="context"/>.</summary>
    /// <param name="isUserOwned">Whether the widget's entity is user-owned (from <c>ISecurityEnforcer</c>).</param>
    public static string Build(DashboardWidget widget, ReportExecutionContext context, bool isUserOwned)
    {
        ArgumentNullException.ThrowIfNull(widget);
        ArgumentNullException.ThrowIfNull(context);

        var payload = new StringBuilder()
            .Append(widget.Id).Append('|')
            .Append(WidgetParams(widget)).Append('|')
            .Append(context.RoleSetHash);

        if (isUserOwned)
        {
            payload.Append('|').Append(context.UserId);
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload.ToString()));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    // Deterministic, order-independent representation of the widget's query-shaping fields.
    private static string WidgetParams(DashboardWidget w) =>
        string.Join(';', new[]
        {
            $"e={w.Entity}",
            $"g={w.GroupByAttribute ?? "-"}",
            $"m={w.MeasureAttribute ?? "-"}",
            $"a={w.Aggregation}"
        }.OrderBy(s => s, StringComparer.Ordinal));
}

using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Scopes an embedded sub-report to a parent row: appends an equals filter on the relationship's
/// child key so the sub-report (a full, independent report definition) shows only rows related to
/// the parent. Pure — reuses the normal query pipeline via the returned definition.
/// </summary>
public static class SubReportPlanner
{
    /// <summary>
    /// Returns <paramref name="subReport"/> with an added <c>childKey == parentKey</c> filter. When
    /// <paramref name="childKey"/> is empty the sub-report runs unscoped (unchanged).
    /// </summary>
    public static ReportDefinition ScopeToParent(ReportDefinition subReport, string? childKey, string parentKey)
    {
        ArgumentNullException.ThrowIfNull(subReport);
        ArgumentException.ThrowIfNullOrEmpty(parentKey);
        if (string.IsNullOrEmpty(childKey))
        {
            return subReport;
        }

        var nextSequence = subReport.Filters.Count == 0 ? 1 : subReport.Filters.Max(f => f.Sequence) + 1;
        var scopeFilter = new ReportFilter
        {
            Id = Guid.Empty,
            FieldAlias = childKey,
            Operator = new CodedValue(null, "Equals"),
            Value = parentKey,
            IsRuntimePrompt = false,
            Sequence = nextSequence
        };

        return subReport with { Filters = [.. subReport.Filters, scopeFilter] };
    }
}

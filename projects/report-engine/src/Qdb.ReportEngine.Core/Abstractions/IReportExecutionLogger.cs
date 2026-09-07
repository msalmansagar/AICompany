namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Writes an append-only execution record to the audit log (qdb_reportexecutionlog) so "who ran
/// which report, when, and with what outcome" is answerable — a PDPPL/QCB accountability
/// requirement. Failing to log must never fail the execution it is recording.
/// </summary>
public interface IReportExecutionLogger
{
    /// <summary>Records one report execution.</summary>
    Task LogAsync(ReportExecutionRecord record, CancellationToken cancellationToken);
}

/// <summary>One execution's audit facts.</summary>
public sealed record ReportExecutionRecord
{
    public required Guid ReportId { get; init; }

    public required string ReportName { get; init; }

    /// <summary>The user the report ran as (from the execution context).</summary>
    public required Guid UserId { get; init; }

    public required string CorrelationId { get; init; }

    public required DateTimeOffset StartedOn { get; init; }

    public required int DurationMs { get; init; }

    public required int RowCount { get; init; }

    public required bool Success { get; init; }

    /// <summary>Error code when the execution failed, otherwise <c>null</c>.</summary>
    public string? ErrorCode { get; init; }
}

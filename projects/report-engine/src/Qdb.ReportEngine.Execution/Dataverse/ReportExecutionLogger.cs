using System.Globalization;
using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Writes execution records to qdb_reportexecutionlog. Writes with the service identity (not the
/// requesting user) so the log always records — a user cannot suppress their own audit trail — and
/// captures the acting user id in the record. A logging failure is swallowed (with a warning) so it
/// never breaks the execution being audited.
/// </summary>
public sealed class ReportExecutionLogger(
    IDataverseConnectionFactory connectionFactory,
    ILogger<ReportExecutionLogger> logger) : IReportExecutionLogger
{
    // UserId.Empty → the connection does not impersonate, so the write runs as the service identity.
    private static readonly ReportExecutionContext SystemContext = new() { UserId = Guid.Empty, RoleSetHash = "system" };

    /// <inheritdoc />
    public async Task LogAsync(ReportExecutionRecord record, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(record);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(SystemContext, cancellationToken).ConfigureAwait(false);
            await connection.CreateAsync("qdb_reportexecutionlog", BuildAttributes(record), cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to write execution audit log for report {ReportId} (corr {CorrelationId})",
                record.ReportId, record.CorrelationId);
        }
    }

    private static Dictionary<string, object?> BuildAttributes(ReportExecutionRecord record)
    {
        var name = $"{record.ReportName} @ {record.StartedOn.UtcDateTime.ToString("u", CultureInfo.InvariantCulture)}";
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["qdb_name"] = name.Length > 100 ? name[..100] : name,
            ["qdb_correlationid"] = record.CorrelationId,
            ["qdb_requestid"] = record.CorrelationId,
            ["qdb_startedon"] = record.StartedOn.UtcDateTime.ToString("o", CultureInfo.InvariantCulture),
            ["qdb_durationms"] = record.DurationMs,
            ["qdb_rowcount"] = record.RowCount,
            ["qdb_resultsummary"] = $"user={record.UserId}; outcome={(record.Success ? "success" : "failed")}; rows={record.RowCount}",
            ["qdb_errorcode"] = record.ErrorCode,
            ["Qdb_reportdefinitionid@odata.bind"] = $"/qdb_reportdefinitions({record.ReportId})"
        };
    }
}

using Microsoft.AspNetCore.Mvc;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Api.Controllers;

/// <summary>
/// Reads stored report definitions. Returns the runtime <see cref="ReportDefinition"/> model the
/// query pipeline consumes; execution of a report is a later endpoint.
/// </summary>
[ApiController]
[Route("api/reports")]
public sealed class ReportsController(
    IReportDefinitionLoader loader,
    IReportExecutor executor,
    IReportExportService exportService,
    IReportChartService chartService) : ControllerBase
{
    /// <summary>Loads the report definition and its children by id.</summary>
    [HttpGet("{reportId:guid}")]
    public async Task<ActionResult<ReportDefinition>> Get(Guid reportId, CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var result = await loader.LoadAsync(reportId, context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return result.Error!.Code == "not_found"
            ? NotFound(new { result.Error.Code, result.Error.Message })
            : StatusCode(StatusCodes.Status502BadGateway, new { result.Error.Code, result.Error.Message });
    }

    /// <summary>Executes the report and returns its shaped tabular result.</summary>
    [HttpPost("{reportId:guid}/execute")]
    public async Task<ActionResult<ReportResult>> Execute(
        Guid reportId, [FromBody] ReportExecutionRequest? request, CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var result = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return result.Error!.Code == "not_found"
            ? NotFound(new { result.Error.Code, result.Error.Message })
            : StatusCode(StatusCodes.Status502BadGateway, new { result.Error.Code, result.Error.Message });
    }

    /// <summary>Drills down through a relationship: returns the related child rows for a parent key.</summary>
    [HttpPost("{reportId:guid}/relationships/{relationshipId:guid}/drilldown")]
    public async Task<ActionResult<ReportResult>> Drilldown(
        Guid reportId,
        Guid relationshipId,
        [FromBody] ReportDrilldownRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrEmpty(request.ParentKey))
        {
            return BadRequest(new { code = "invalid_request", message = "parentKey is required." });
        }

        var context = BuildContext();
        var result = await executor.ExecuteDrilldownAsync(reportId, relationshipId, request.ParentKey, context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return result.Error!.Code == "not_found"
            ? NotFound(new { result.Error.Code, result.Error.Message })
            : StatusCode(StatusCodes.Status502BadGateway, new { result.Error.Code, result.Error.Message });
    }

    /// <summary>Executes the report and renders it as a chart PNG (column/bar/line/pie).</summary>
    [HttpPost("{reportId:guid}/chart")]
    public async Task<IActionResult> Chart(
        Guid reportId,
        [FromQuery] string? type,
        [FromQuery] string? category,
        [FromQuery] string? value,
        [FromBody] ReportExecutionRequest? request,
        CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var execution = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (!execution.IsSuccess)
        {
            return execution.Error!.Code == "not_found"
                ? NotFound(new { execution.Error.Code, execution.Error.Message })
                : StatusCode(StatusCodes.Status502BadGateway, new { execution.Error.Code, execution.Error.Message });
        }

        var options = new ChartOptions(string.IsNullOrEmpty(type) ? "column" : type, category, value);
        var chart = chartService.Render(execution.Value, options);
        return chart.IsSuccess
            ? File(chart.Value.Content, chart.Value.ContentType, chart.Value.FileName)
            : BadRequest(new { chart.Error!.Code, chart.Error.Message });
    }

    /// <summary>Executes the report and returns it as a downloadable file (CSV or Excel).</summary>
    [HttpPost("{reportId:guid}/export")]
    public async Task<IActionResult> Export(
        Guid reportId,
        [FromQuery] string format,
        [FromBody] ReportExecutionRequest? request,
        CancellationToken cancellationToken)
    {
        if (!TryParseFormat(format, out var exportFormat))
        {
            return BadRequest(new { code = "unsupported_format", message = $"Unknown export format '{format}'. Use csv, excel, word, pdf, or image." });
        }

        var context = BuildContext();
        var execution = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (!execution.IsSuccess)
        {
            return execution.Error!.Code == "not_found"
                ? NotFound(new { execution.Error.Code, execution.Error.Message })
                : StatusCode(StatusCodes.Status502BadGateway, new { execution.Error.Code, execution.Error.Message });
        }

        var export = exportService.Export(execution.Value, exportFormat);
        return export.IsSuccess
            ? File(export.Value.Content, export.Value.ContentType, export.Value.FileName)
            : BadRequest(new { export.Error!.Code, export.Error.Message });
    }

    private static bool TryParseFormat(string? format, out ExportFormat exportFormat)
    {
        switch (format?.ToLowerInvariant())
        {
            case "csv":
                exportFormat = ExportFormat.Csv;
                return true;
            case "excel" or "xlsx":
                exportFormat = ExportFormat.Excel;
                return true;
            case "word" or "docx":
                exportFormat = ExportFormat.Word;
                return true;
            case "pdf":
                exportFormat = ExportFormat.Pdf;
                return true;
            case "image" or "png":
                exportFormat = ExportFormat.Image;
                return true;
            default:
                exportFormat = default;
                return false;
        }
    }

    // TODO(build): resolve the execution context from the authenticated principal (mirrors DashboardsController).
    private static ReportExecutionContext BuildContext() => new()
    {
        UserId = Guid.Empty,
        RoleSetHash = "anonymous"
    };
}

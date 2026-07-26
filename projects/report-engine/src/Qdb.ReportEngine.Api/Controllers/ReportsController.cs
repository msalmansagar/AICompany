using Microsoft.AspNetCore.Mvc;
using Qdb.ReportEngine.Api.Authentication;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
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
    IReportDefinitionWriter writer,
    IReportExecutor executor,
    IReportExportService exportService,
    IReportChartService chartService,
    CallerContext caller) : ControllerBase
{
    /// <summary>Lists the reports the caller can see (the catalog).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ReportSummary>>> List(CancellationToken cancellationToken)
    {
        var result = await loader.ListAsync(caller.Require(), cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error!);
    }

    /// <summary>
    /// Persists a report composed in the designer (the definition and all its children) as the
    /// requesting user, and returns the new report id. The client-supplied <c>Id</c> is ignored — a
    /// new record is always created.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<object>> Create([FromBody] ReportDefinition definition, CancellationToken cancellationToken)
    {
        if (definition is null || string.IsNullOrWhiteSpace(definition.Name))
        {
            return BadRequest(new { code = "invalid_request", message = "A report name is required." });
        }

        var result = await writer.CreateAsync(definition, caller.Require(), cancellationToken);
        return result.IsSuccess
            ? CreatedAtAction(nameof(Get), new { reportId = result.Value }, new { id = result.Value })
            : Problem(result.Error!);
    }

    /// <summary>
    /// Updates report <paramref name="reportId"/> in place, replacing its children from the request
    /// body — so a report loaded into the designer can be edited and re-saved without duplicating.
    /// </summary>
    [HttpPut("{reportId:guid}")]
    public async Task<ActionResult<object>> Update(Guid reportId, [FromBody] ReportDefinition definition, CancellationToken cancellationToken)
    {
        if (definition is null || string.IsNullOrWhiteSpace(definition.Name))
        {
            return BadRequest(new { code = "invalid_request", message = "A report name is required." });
        }

        var result = await writer.UpdateAsync(reportId, definition, caller.Require(), cancellationToken);
        return result.IsSuccess ? Ok(new { id = result.Value }) : Problem(result.Error!);
    }

    /// <summary>Deletes report <paramref name="reportId"/> and all of its children.</summary>
    [HttpDelete("{reportId:guid}")]
    public async Task<ActionResult> Delete(Guid reportId, CancellationToken cancellationToken)
    {
        var result = await writer.DeleteAsync(reportId, caller.Require(), cancellationToken);
        return result.IsSuccess ? NoContent() : Problem(result.Error!);
    }

    /// <summary>Loads the report definition and its children by id.</summary>
    [HttpGet("{reportId:guid}")]
    public async Task<ActionResult<ReportDefinition>> Get(Guid reportId, CancellationToken cancellationToken)
    {
        var context = caller.Require();
        var result = await loader.LoadAsync(reportId, context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return Problem(result.Error!);
    }

    /// <summary>Executes the report and returns its shaped tabular result.</summary>
    [HttpPost("{reportId:guid}/execute")]
    public async Task<ActionResult<ReportResult>> Execute(
        Guid reportId, [FromBody] ReportExecutionRequest? request, CancellationToken cancellationToken)
    {
        var context = caller.Require();
        var result = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return Problem(result.Error!);
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

        var context = caller.Require();
        var result = await executor.ExecuteDrilldownAsync(reportId, relationshipId, request.ParentKey, context, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        return Problem(result.Error!);
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
        var context = caller.Require();
        var execution = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (!execution.IsSuccess)
        {
            return Problem(execution.Error!);
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

        var context = caller.Require();
        var execution = await executor.ExecuteAsync(reportId, request ?? new ReportExecutionRequest(), context, cancellationToken);
        if (!execution.IsSuccess)
        {
            return Problem(execution.Error!);
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

    private ActionResult Problem(DomainError error) => error.Code switch
    {
        "not_found" => NotFound(new { error.Code, error.Message }),
        "permission_denied" => StatusCode(StatusCodes.Status403Forbidden, new { error.Code, error.Message }),
        _ => StatusCode(StatusCodes.Status502BadGateway, new { error.Code, error.Message })
    };

}

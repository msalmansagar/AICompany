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
public sealed class ReportsController(IReportDefinitionLoader loader) : ControllerBase
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

    // TODO(build): resolve the execution context from the authenticated principal (mirrors DashboardsController).
    private static ReportExecutionContext BuildContext() => new()
    {
        UserId = Guid.Empty,
        RoleSetHash = "anonymous"
    };
}

using Microsoft.AspNetCore.Mvc;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Api.Controllers;

/// <summary>
/// Lists, loads, and executes dashboards for the requesting user. The streaming endpoint returns
/// widgets as they resolve (ADR-RPT-008 §5) so the client can render progressively.
/// </summary>
[ApiController]
[Route("api/dashboards")]
public sealed class DashboardsController(
    IDashboardExecutionService executionService, IDashboardDefinitionLoader loader) : ControllerBase
{
    /// <summary>Lists the dashboards the caller can see (the catalog).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DashboardSummary>>> List(CancellationToken cancellationToken)
    {
        var result = await loader.ListAsync(BuildContext(), cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error!);
    }

    /// <summary>Loads a persisted dashboard definition by id.</summary>
    [HttpGet("{dashboardId:guid}")]
    public async Task<ActionResult<DashboardDefinition>> Get(Guid dashboardId, CancellationToken cancellationToken)
    {
        var result = await loader.LoadAsync(dashboardId, BuildContext(), cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error!);
    }

    /// <summary>Executes a dashboard and returns all widget results once resolved.</summary>
    [HttpPost("{dashboardId:guid}/execute")]
    public async Task<ActionResult<DashboardResult>> Execute(
        Guid dashboardId,
        [FromBody] DashboardDefinition dashboard,
        CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var result = await executionService.ExecuteAsync(dashboard, context, cancellationToken);
        return Ok(result);
    }

    /// <summary>Executes a dashboard and streams each widget result as it resolves (NDJSON).</summary>
    [HttpPost("{dashboardId:guid}/stream")]
    public async IAsyncEnumerable<WidgetResult> Stream(
        Guid dashboardId,
        [FromBody] DashboardDefinition dashboard,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var context = BuildContext();
        await foreach (var widget in executionService.ExecuteStreamAsync(dashboard, context, cancellationToken))
        {
            yield return widget;
        }
    }

    private ActionResult Problem(DomainError error) => error.Code switch
    {
        "not_found" => NotFound(new { error.Code, error.Message }),
        "permission_denied" => StatusCode(StatusCodes.Status403Forbidden, new { error.Code, error.Message }),
        _ => StatusCode(StatusCodes.Status502BadGateway, new { error.Code, error.Message })
    };

    // Widgets execute as this user (impersonation → row-level security). The web resource passes the
    // signed-in user's id; production must derive it from a validated token, not a raw header.
    private ReportExecutionContext BuildContext()
    {
        var header = Request.Headers["X-Report-Caller-Id"].FirstOrDefault() ?? Request.Headers["MSCRMCallerID"].FirstOrDefault();
        var userId = Guid.TryParse(header, out var id) ? id : Guid.Empty;
        return new ReportExecutionContext
        {
            UserId = userId,
            RoleSetHash = userId == Guid.Empty ? "anonymous" : userId.ToString("N")
        };
    }
}

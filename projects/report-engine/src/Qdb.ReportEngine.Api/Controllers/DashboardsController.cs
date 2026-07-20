using Microsoft.AspNetCore.Mvc;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Api.Controllers;

/// <summary>
/// Executes dashboards for the requesting user. The streaming endpoint returns widgets as
/// they resolve (ADR-RPT-008 §5) so the client can render progressively.
/// </summary>
[ApiController]
[Route("api/dashboards")]
public sealed class DashboardsController(IDashboardExecutionService executionService) : ControllerBase
{
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

    // TODO(build): resolve the execution context from the authenticated principal — user id,
    // business unit, delegated (OBO) token, and role-set hash. Placeholder for the scaffold.
    private static ReportExecutionContext BuildContext() => new()
    {
        UserId = Guid.Empty,
        RoleSetHash = "anonymous"
    };
}

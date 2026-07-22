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
    IDashboardExecutionService executionService,
    IDashboardDefinitionLoader loader,
    IDashboardWriter writer) : ControllerBase
{
    /// <summary>Lists the dashboards the caller can see (the catalog).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DashboardSummary>>> List(CancellationToken cancellationToken)
    {
        var result = await loader.ListAsync(BuildContext(), cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error!);
    }

    /// <summary>
    /// Persists a dashboard composed in the designer (the dashboard, its sections, and each section's
    /// widgets) as the requesting user, and returns the new dashboard id. The client-supplied
    /// <c>Id</c> is ignored — a new record is always created.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<object>> Create([FromBody] DashboardDefinition dashboard, CancellationToken cancellationToken)
    {
        if (dashboard is null || string.IsNullOrWhiteSpace(dashboard.Title))
        {
            return BadRequest(new { code = "invalid_request", message = "A dashboard title is required." });
        }

        var result = await writer.CreateAsync(dashboard, BuildContext(), cancellationToken);
        return result.IsSuccess
            ? CreatedAtAction(nameof(Get), new { dashboardId = result.Value }, new { id = result.Value })
            : Problem(result.Error!);
    }

    /// <summary>
    /// Updates dashboard <paramref name="dashboardId"/> in place, replacing its sections and widgets
    /// from the request body. Lets a dashboard loaded into the designer be edited and re-saved without
    /// creating a duplicate.
    /// </summary>
    [HttpPut("{dashboardId:guid}")]
    public async Task<ActionResult<object>> Update(Guid dashboardId, [FromBody] DashboardDefinition dashboard, CancellationToken cancellationToken)
    {
        if (dashboard is null || string.IsNullOrWhiteSpace(dashboard.Title))
        {
            return BadRequest(new { code = "invalid_request", message = "A dashboard title is required." });
        }

        var result = await writer.UpdateAsync(dashboardId, dashboard, BuildContext(), cancellationToken);
        return result.IsSuccess ? Ok(new { id = result.Value }) : Problem(result.Error!);
    }

    /// <summary>Deletes dashboard <paramref name="dashboardId"/> and its sections and widgets.</summary>
    [HttpDelete("{dashboardId:guid}")]
    public async Task<ActionResult> Delete(Guid dashboardId, CancellationToken cancellationToken)
    {
        var result = await writer.DeleteAsync(dashboardId, BuildContext(), cancellationToken);
        return result.IsSuccess ? NoContent() : Problem(result.Error!);
    }

    /// <summary>Loads a persisted dashboard definition by id.</summary>
    [HttpGet("{dashboardId:guid}")]
    public async Task<ActionResult<DashboardDefinition>> Get(Guid dashboardId, CancellationToken cancellationToken)
    {
        var result = await loader.LoadAsync(dashboardId, BuildContext(), cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : Problem(result.Error!);
    }

    /// <summary>
    /// Executes the stored dashboard identified by <paramref name="dashboardId"/> and returns all
    /// widget results once resolved. The definition is loaded from Dataverse (as the user) — never
    /// taken from the request body — so record-level security on the definition is honoured.
    /// </summary>
    [HttpPost("{dashboardId:guid}/execute")]
    public async Task<ActionResult<DashboardResult>> Execute(Guid dashboardId, CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var loaded = await loader.LoadAsync(dashboardId, context, cancellationToken);
        if (!loaded.IsSuccess)
        {
            return Problem(loaded.Error!);
        }

        var result = await executionService.ExecuteAsync(loaded.Value, context, cancellationToken);
        return Ok(result);
    }

    /// <summary>Executes the stored dashboard and streams each widget result as it resolves.</summary>
    [HttpPost("{dashboardId:guid}/stream")]
    public async IAsyncEnumerable<WidgetResult> Stream(
        Guid dashboardId,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var context = BuildContext();
        var loaded = await loader.LoadAsync(dashboardId, context, cancellationToken);
        if (!loaded.IsSuccess)
        {
            yield break;
        }

        await foreach (var widget in executionService.ExecuteStreamAsync(loaded.Value, context, cancellationToken))
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

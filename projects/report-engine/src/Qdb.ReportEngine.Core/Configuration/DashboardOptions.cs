namespace Qdb.ReportEngine.Core.Configuration;

/// <summary>
/// Dashboard fan-out and concurrency configuration (ADR-RPT-008). Bound from the
/// <c>Dashboard</c> configuration section. Defaults differ by deployment target.
/// </summary>
public sealed class DashboardOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Dashboard";

    /// <summary>Deployment target — selects OBO (cloud) vs impersonation (on-prem) and the default caps.</summary>
    public DeploymentTarget Target { get; init; } = DeploymentTarget.Cloud;

    /// <summary>Max simultaneous widget queries within a single dashboard open (ADR-RPT-008 §2, per-dashboard cap). Default 6.</summary>
    public int MaxConcurrentWidgetQueries { get; init; } = 6;

    /// <summary>Process-wide cap on concurrent CRM connections (ADR-RPT-008 §2, global gate). Default 40 cloud / 30 on-prem.</summary>
    public int MaxConcurrentQueries { get; init; } = 40;

    /// <summary>Per-widget P95 data-latency SLA (DC-1). Used for logging/alerting, not enforcement.</summary>
    public TimeSpan PerWidgetSla { get; init; } = TimeSpan.FromSeconds(4);

    /// <summary>Whether same-entity widgets are grouped into one $batch / ExecuteMultiple call (ADR-RPT-008 §3).</summary>
    public bool GroupSameEntityQueries { get; init; } = true;

    /// <summary>Result cache time-to-live for widget queries (ADR-RPT-007 role-keyed cache).</summary>
    public TimeSpan WidgetCacheTtl { get; init; } = TimeSpan.FromMinutes(10);
}

/// <summary>Deployment target for a report-engine instance.</summary>
public enum DeploymentTarget
{
    /// <summary>Dataverse cloud — MSAL On-Behalf-Of delegated execution.</summary>
    Cloud,

    /// <summary>Dynamics 365 on-premise 9.x — Organization Service impersonation.</summary>
    OnPremise
}

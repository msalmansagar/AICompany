using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Execution.Caching;
using Qdb.ReportEngine.Execution.Dashboards;
using Qdb.ReportEngine.Execution.Dataverse;
using Qdb.ReportEngine.Execution.Resilience;
using Qdb.ReportEngine.Execution.Security;

namespace Qdb.ReportEngine.Execution.DependencyInjection;

/// <summary>Composition root for the execution engine. Keeps DI wiring out of the API host.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the dashboard execution engine (ADR-RPT-008) and its collaborators.
    /// Singletons hold process-wide state (the global concurrency gate, coalescer, cache);
    /// everything else is scoped to a request.
    /// </summary>
    public static IServiceCollection AddReportEngineExecution(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DashboardOptions>(configuration.GetSection(DashboardOptions.SectionName));

        // Process-wide singletons.
        services.AddSingleton<DashboardConcurrencyGate>();
        services.AddSingleton<IInFlightRequestCoalescer, InFlightRequestCoalescer>();
        services.AddSingleton<ICacheStore, InMemoryCacheStore>(); // TODO(build): swap for distributed cache (ADR-RPT-007).

        // Per-request / stateless services.
        services.AddScoped<IDashboardExecutionService, DashboardExecutionService>();
        services.AddScoped<IReportDataProvider, CrmReportDataProvider>();
        services.AddScoped<IDataverseConnectionFactory, DataverseConnectionFactory>();
        services.AddScoped<ISecurityEnforcer, CrmSecurityEnforcer>();
        services.AddSingleton<IWidgetQueryPlanner, WidgetQueryPlanner>();
        services.AddSingleton<IWidgetExecutionPolicy, WidgetExecutionPolicy>();

        return services;
    }
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Execution.Caching;
using Qdb.ReportEngine.Execution.Dashboards;
using Qdb.ReportEngine.Execution.Dataverse;
using Qdb.ReportEngine.Execution.Export;
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
        services.Configure<DataverseOptions>(configuration.GetSection(DataverseOptions.SectionName));

        // Process-wide singletons.
        services.AddSingleton<DashboardConcurrencyGate>();
        services.AddSingleton<IInFlightRequestCoalescer, InFlightRequestCoalescer>();
        services.AddSingleton<ICacheStore, InMemoryCacheStore>(); // TODO(build): swap for distributed cache (ADR-RPT-007).

        // Per-request / stateless services.
        services.AddScoped<IDashboardExecutionService, DashboardExecutionService>();
        services.AddScoped<IReportDataProvider, CrmReportDataProvider>();
        services.AddScoped<IReportDefinitionLoader, ReportDefinitionLoader>();
        services.AddScoped<IDashboardDefinitionLoader, DashboardDefinitionLoader>();
        services.AddScoped<IReportExecutor, ReportExecutor>();
        services.AddScoped<ISecurityEnforcer, CrmSecurityEnforcer>();

        // Report exporters (registered as a set; ReportExportService selects by format).
        services.AddSingleton<IReportExporter, CsvReportExporter>();
        services.AddSingleton<IReportExporter, ExcelReportExporter>();
        services.AddSingleton<IReportExporter, WordReportExporter>();
        services.AddSingleton<IReportExporter, PdfReportExporter>();
        services.AddSingleton<IReportExporter, ImageReportExporter>();
        services.AddSingleton<IReportExportService, ReportExportService>();
        services.AddSingleton<IReportChartService, ReportChartService>();
        services.AddSingleton<IWidgetQueryPlanner, WidgetQueryPlanner>();
        services.AddSingleton<IWidgetExecutionPolicy, WidgetExecutionPolicy>();

        AddDataverseConnectivity(services, configuration);
        return services;
    }

    // Uses the live Web API path when Dataverse is configured; otherwise a stub so the host still
    // boots and dashboards degrade gracefully (each widget reports "not configured").
    private static void AddDataverseConnectivity(IServiceCollection services, IConfiguration configuration)
    {
        var dataverse = configuration.GetSection(DataverseOptions.SectionName).Get<DataverseOptions>() ?? new DataverseOptions();
        if (dataverse.IsConfigured)
        {
            services.AddHttpClient();
            services.AddSingleton<IDataverseTokenProvider, MsalTokenProvider>();
            services.AddSingleton<IEntitySetResolver, EntitySetResolver>();
            services.AddScoped<IDataverseConnectionFactory, WebApiDataverseConnectionFactory>();
        }
        else
        {
            services.AddScoped<IDataverseConnectionFactory, StubDataverseConnectionFactory>();
        }
    }
}

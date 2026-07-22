using System.Text.Json.Serialization;
using Qdb.ReportEngine.Execution.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();

// CORS so the CRM-hosted web resource (a different origin) can call the API. Origins come from
// the "Cors:Origins" setting; when unset, dev allows any origin.
const string CorsPolicy = "ReportEngineCors";
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
{
    policy.AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition");
    if (corsOrigins.Length > 0)
    {
        policy.WithOrigins(corsOrigins);
    }
    else
    {
        policy.SetIsOriginAllowed(_ => true);
    }
}));

// Report Engine execution engine (dashboard fan-out per ADR-RPT-008).
builder.Services.AddReportEngineExecution(builder.Configuration);

var app = builder.Build();

app.UseCors(CorsPolicy);
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "Qdb.ReportEngine.Api" }));

app.Run();

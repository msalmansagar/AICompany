using System.Text.Json.Serialization;
using Qdb.ReportEngine.Execution.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();

// Report Engine execution engine (dashboard fan-out per ADR-RPT-008).
builder.Services.AddReportEngineExecution(builder.Configuration);

var app = builder.Build();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "Qdb.ReportEngine.Api" }));

app.Run();

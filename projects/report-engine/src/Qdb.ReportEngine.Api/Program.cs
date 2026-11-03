using System.Text.Json.Serialization;
using Qdb.ReportEngine.Api.Authentication;
using Qdb.ReportEngine.Execution.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers(options => options.Filters.Add<ResolveCallerContextFilter>())
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();

// Every endpoint requires an authenticated caller, and the user a report runs as is derived from
// validated credentials rather than a client-supplied header (B1).
builder.Services.AddReportEngineAuthentication(builder.Configuration, builder.Environment);

// CORS so the CRM-hosted web resource (a different origin) can call the API. Origins come from
// the "Cors:Origins" setting; when unset, dev allows any origin.
const string CorsPolicy = "ReportEngineCors";
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
if (corsOrigins.Length == 0 && !builder.Environment.IsDevelopment())
{
    // Never fall back to an open CORS policy outside Development — a wildcard origin combined with
    // per-user execution would let any site read a signed-in user's data.
    throw new InvalidOperationException("Cors:Origins must be configured outside the Development environment.");
}
builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
{
    policy.AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition");
    if (corsOrigins.Length > 0)
    {
        policy.WithOrigins(corsOrigins);
    }
    else
    {
        policy.SetIsOriginAllowed(_ => true); // Development only — guarded above.
    }
}));

// Report Engine execution engine (dashboard fan-out per ADR-RPT-008).
builder.Services.AddReportEngineExecution(builder.Configuration);

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    // Bearer tokens and the service secret must never cross the wire in clear text.
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Liveness only — deliberately anonymous, and returns nothing about the org or its configuration.
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "Qdb.ReportEngine.Api" }))
    .AllowAnonymous();

app.Run();

/// <summary>Exposed so the integration tests can boot the real pipeline via WebApplicationFactory.</summary>
public partial class Program;
